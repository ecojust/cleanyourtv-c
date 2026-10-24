//! Low-frame-rate live screen preview. It is read-only and independent of device mutations.
use base64::{engine::general_purpose::STANDARD, Engine};
use puretv_core::Snapshot;
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
type Fetch = Arc<dyn Fn(&Path, &str, &AtomicBool) -> Result<Vec<u8>, String> + Send + Sync>;
pub type Emit = Arc<dyn Fn(&str, Value) + Send + Sync>;
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub running: bool,
    pub paused: bool,
    pub serial: Option<String>,
    pub user_id: Option<u32>,
    pub target_fps: u8,
    pub actual_fps: f64,
    pub frames: u64,
    pub timestamp_ms: Option<u64>,
    pub message: String,
}
struct State {
    status: Status,
    frame: Option<Value>,
}
pub struct LiveView {
    snapshot: Arc<Mutex<Snapshot>>,
    state: Mutex<State>,
    lifecycle: Mutex<()>,
    worker: Mutex<Option<JoinHandle<()>>>,
    cancel: Arc<AtomicBool>,
    fetch: Fetch,
}
impl LiveView {
    pub fn new(snapshot: Arc<Mutex<Snapshot>>) -> Arc<Self> {
        Self::with_fetch(snapshot, Arc::new(puretv_core::capture_screen))
    }
    fn with_fetch(snapshot: Arc<Mutex<Snapshot>>, fetch: Fetch) -> Arc<Self> {
        Arc::new(Self {
            snapshot,
            state: Mutex::new(State {
                status: Status {
                    target_fps: 1,
                    message: "尚未开始实时预览".into(),
                    ..Status::default()
                },
                frame: None,
            }),
            lifecycle: Mutex::new(()),
            worker: Mutex::new(None),
            cancel: Arc::new(AtomicBool::new(false)),
            fetch,
        })
    }
    pub fn status(&self) -> Result<Status, String> {
        Ok(self
            .state
            .lock()
            .map_err(|_| "实时预览状态不可用")?
            .status
            .clone())
    }
    pub fn frame(&self) -> Result<Value, String> {
        let snapshot = self.snapshot.lock().map_err(|_| "设备状态不可用")?.clone();
        let state = self.state.lock().map_err(|_| "实时预览状态不可用")?;
        let device = snapshot
            .device
            .filter(|d| d.status == "device")
            .ok_or("请先连接并授权电视")?;
        if state.status.serial.as_deref() != Some(&device.serial)
            || state.status.user_id != Some(device.user_id)
        {
            return Err("设备已改变，请重新开始实时预览".into());
        }
        state
            .frame
            .clone()
            .ok_or_else(|| "尚未获取到实时画面，请稍后重试".into())
    }
    fn join_previous(&self) {
        self.cancel.store(true, Ordering::Release);
        if let Ok(mut worker) = self.worker.lock() {
            if let Some(handle) = worker.take() {
                let _ = handle.join();
            }
        }
        if let Ok(mut state) = self.state.lock() {
            state.status.running = false;
        }
    }
    pub fn stop(&self, paused: bool, emit: &Emit) -> Result<Status, String> {
        let _lifecycle = self.lifecycle.lock().map_err(|_| "实时预览状态不可用")?;
        self.join_previous();
        let mut state = self.state.lock().map_err(|_| "实时预览状态不可用")?;
        state.status.running = false;
        state.status.paused = paused;
        state.status.actual_fps = 0.0;
        state.status.message = if paused {
            "实时预览已暂停"
        } else {
            "实时预览已停止"
        }
        .into();
        if !paused {
            state.frame = None;
        }
        let status = state.status.clone();
        drop(state);
        emit("live-state", json!(status));
        Ok(status)
    }
    pub fn start(self: &Arc<Self>, fps: u8, emit: Emit) -> Result<Status, String> {
        if !(1..=3).contains(&fps) {
            return Err("预览目标帧率应为 1–3".into());
        }
        let _lifecycle = self.lifecycle.lock().map_err(|_| "实时预览状态不可用")?;
        self.join_previous();
        let snapshot = self.snapshot.lock().map_err(|_| "设备状态不可用")?.clone();
        let device = snapshot
            .device
            .filter(|d| d.status == "device")
            .ok_or("请先连接并授权电视")?;
        let program = snapshot
            .adb_path
            .filter(|_| snapshot.adb_available)
            .ok_or("ADB 尚未就绪")?;
        self.cancel.store(false, Ordering::Release);
        let status = Status {
            running: true,
            paused: false,
            serial: Some(device.serial.clone()),
            user_id: Some(device.user_id),
            target_fps: fps,
            message: format!("实时预览准备中，目标 {fps} 帧/秒"),
            ..Status::default()
        };
        {
            let mut state = self.state.lock().map_err(|_| "实时预览状态不可用")?;
            state.status = status.clone();
            state.frame = None;
        }
        emit("live-state", json!(status));
        let service = self.clone();
        let worker = std::thread::spawn(move || {
            let interval = Duration::from_secs_f64(1.0 / f64::from(fps));
            let mut previous = None;
            while !service.cancel.load(Ordering::Acquire) {
                let start = Instant::now();
                let valid = service.snapshot.lock().ok().is_some_and(|snapshot| {
                    snapshot.adb_path.as_deref() == Some(&program)
                        && snapshot.device.as_ref().is_some_and(|d| {
                            d.serial == device.serial
                                && d.user_id == device.user_id
                                && d.status == "device"
                        })
                });
                if !valid {
                    service.fail("设备连接已变化，实时预览已停止", &emit);
                    break;
                }
                match (service.fetch)(Path::new(&program), &device.serial, &service.cancel) {
                    Ok(bytes) => {
                        if service.cancel.load(Ordering::Acquire) {
                            break;
                        }
                        let now = Instant::now();
                        let timestamp = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;
                        let frame = json!({"serial":device.serial,"userId":device.user_id,"image":format!("data:image/png;base64,{}",STANDARD.encode(&bytes)),"timestampMs":timestamp});
                        let mut state = match service.state.lock() {
                            Ok(state) => state,
                            Err(_) => break,
                        };
                        state.status.frames += 1;
                        state.status.timestamp_ms = Some(timestamp);
                        state.status.actual_fps = previous
                            .map(|last: Instant| {
                                (10.0 / now.duration_since(last).as_secs_f64()).round() / 10.0
                            })
                            .unwrap_or(0.0);
                        previous = Some(now);
                        state.status.message = "正在显示电视当前画面（连续截图预览）".into();
                        state.frame = Some(frame.clone());
                        let status = state.status.clone();
                        drop(state);
                        emit("live-frame", json!({"frame":frame,"status":status}));
                    }
                    Err(error) => {
                        if !service.cancel.load(Ordering::Acquire) {
                            service.fail(&error, &emit);
                        }
                        break;
                    }
                }
                while start.elapsed() < interval && !service.cancel.load(Ordering::Acquire) {
                    std::thread::sleep(Duration::from_millis(25));
                }
            }
        });
        *self.worker.lock().map_err(|_| "实时预览线程不可用")? = Some(worker);
        Ok(status)
    }
    fn fail(&self, message: &str, emit: &Emit) {
        if let Ok(mut state) = self.state.lock() {
            state.status.running = false;
            state.status.paused = false;
            state.status.actual_fps = 0.0;
            state.status.message = message.into();
            emit("live-state", json!(state.status));
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn live_preview_pauses_retains_frame_and_stops_for_changed_device() {
        let mut snapshot = Snapshot::default();
        snapshot.adb_path = Some("/test/adb".into());
        snapshot.adb_available = true;
        snapshot.device = Some(puretv_core::Device {
            serial: "tv:5555".into(),
            model: "TV".into(),
            android_version: "13".into(),
            user_id: 0,
            status: "device".into(),
        });
        let snapshot = Arc::new(Mutex::new(snapshot));
        let service = LiveView::with_fetch(snapshot.clone(), Arc::new(|_, _, _| Ok(vec![1, 2, 3])));
        let emit: Emit = Arc::new(|_, _| {});
        service.start(3, emit.clone()).unwrap();
        for _ in 0..50 {
            if service.status().unwrap().frames > 0 {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(service.status().unwrap().frames > 0);
        service.stop(true, &emit).unwrap();
        assert!(service.status().unwrap().paused);
        assert!(service.frame().is_ok());
        service.start(3, emit.clone()).unwrap();
        snapshot.lock().unwrap().device = None;
        for _ in 0..100 {
            if !service.status().unwrap().running {
                break;
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(!service.status().unwrap().running);
        assert!(service.frame().is_err());
        service.stop(false, &emit).unwrap();
        assert!(service.state.lock().unwrap().frame.is_none());
    }
}
