#!/usr/bin/env python3
"""Exercise the built GUI through its stdio MCP proxy using a simulated TV.

Linux CI runs this inside Xvfb. No real TV, network downloads, or user data.
"""
import argparse
import json
import os
from pathlib import Path
import queue
import subprocess
import tempfile
import threading
import time

FAKE_ADB = r'''#!/usr/bin/env python3
import json, os, sys, time
from pathlib import Path
root=Path(os.environ['PURETV_FAKE_ROOT'])
p=root/'tv.json';tv=json.loads(p.read_text());args=sys.argv[1:]
def save():p.write_text(json.dumps(tv))
if args[0]=='version':print('Android Debug Bridge version 1.0.41')
elif args[0]=='devices':print('List of devices attached\n192.168.1.50:5555\tdevice model:TestTV')
elif args[0]=='pair':
 assert sys.stdin.read().strip()=='123456';print('Successfully paired to 192.168.1.50:33111')
elif args[0] in ['connect','disconnect']:print('connected' if args[0]=='connect' else 'disconnected')
elif args[:2]==['-s','192.168.1.50:5555']:
 if args[2]=='install':tv['installed'].append('com.imported.app');save();print('Success')
 else:
  a=args[3:]
  if a[0]=='am':print('0')
  elif a[0]=='getprop':
   if (root/'slow').exists():time.sleep(3)
   print('MCP Test TV' if a[1]=='ro.product.model' else '13')
  elif a[0]=='dumpsys':print('Packages:\n  User 0: installed=true hidden=false enabled=0')
  elif a[:2]==['pm','list']:
   data=tv['system'] if '-s' in a else tv['disabled'] if '-d' in a else list(set(tv['installed']+tv['system'])) if '-u' in a else tv['installed']
   print('\n'.join('package:'+x for x in data))
  elif a[0]=='pm':
   target=a[-1]
   if a[1]=='disable-user':tv['disabled'].append(target)
   elif a[1] in ['enable','default-state']:tv['disabled']=[p for p in tv['disabled'] if p!=target]
   elif a[1]=='uninstall':tv['installed'].remove(target)
   else:raise AssertionError(a)
   save();print('Success' if a[1]=='uninstall' else 'new state: changed')
  elif a[:2]==['cmd','package']:
   if a[2]=='query-activities':print('com.stock.home/.Main\ncom.ecojust.cleanyourtv/.MainActivity')
   elif a[2]=='resolve-activity':print(tv['home'])
   elif a[2]=='set-home-activity':tv['home']=a[-1].strip("'");save();print('Success')
   elif a[2]=='install-existing':tv['installed'].append(a[-1]);save();print('Package installed for user')
   else:raise AssertionError(a)
  else:raise AssertionError(a)
else:raise AssertionError(args)
'''

class Client:
    def __init__(self, binary, session, env):
        self.process = subprocess.Popen([str(binary), '--mcp', str(session)], env=env,
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.messages = queue.Queue()
        self.saved = {}
        self.serial = 0
        def read():
            for line in self.process.stdout:
                try: self.messages.put(json.loads(line))
                except Exception as e: self.messages.put(e)
        threading.Thread(target=read, daemon=True).start()
    def send(self, method, params=None):
        self.serial += 1
        self.process.stdin.write(json.dumps({'jsonrpc':'2.0','id':self.serial,'method':method,'params':params or {}})+'\n')
        self.process.stdin.flush()
        return self.serial
    def receive(self, request_id):
        end = time.monotonic()+30
        while request_id not in self.saved:
            value = self.messages.get(timeout=max(0.01,end-time.monotonic()))
            assert isinstance(value,dict), value
            self.saved[value['id']] = value
        return self.saved.pop(request_id)
    def rpc(self, method, params=None): return self.receive(self.send(method,params))
    def call(self, name, arguments=None, failure=False):
        response = self.rpc('tools/call', {'name':name,'arguments':arguments or {}})
        assert 'error' not in response, response
        result = response['result']
        assert result['isError'] == failure, response
        print('PASS MCP:', name, '(expected failure)' if failure else '', flush=True)
        return result.get('structuredContent',{}).get('result')
    def close(self):
        self.process.stdin.close()
        try: self.process.wait(timeout=10)
        except subprocess.TimeoutExpired: self.process.kill(); self.process.wait()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--binary',required=True)
    binary=Path(parser.parse_args().binary).resolve()
    with tempfile.TemporaryDirectory(prefix='puretv-mcp-smoke-') as temp:
        root=Path(temp);adb=root/'adb';adb.write_text(FAKE_ADB);adb.chmod(0o755)
        (root/'tv.json').write_text(json.dumps({'installed':['android','com.android.systemui','com.stock.home','com.ecojust.cleanyourtv','com.vendor.ads'], 'system':['android','com.android.systemui','com.stock.home','com.vendor.ads','com.vendor.removed'],'disabled':[],'home':'com.stock.home/.Main'}))
        env={**os.environ,'XDG_DATA_HOME':str(root/'data'),'XDG_CONFIG_HOME':str(root/'config'),'XDG_CACHE_HOME':str(root/'cache'),'PURETV_ADB':str(adb),'PURETV_FAKE_ROOT':str(root)}
        with (root/'gui.log').open('w') as log:
            gui=subprocess.Popen([str(binary)],env=env,stdout=log,stderr=log)
            client=None
            try:
                session=root/'data/com.ecojust.puretv.manager/mcp-session.json'
                for _ in range(200):
                    if gui.poll() is not None: raise RuntimeError((root/'gui.log').read_text())
                    if session.exists():break
                    time.sleep(.1)
                assert session.exists(), (root/'gui.log').read_text()
                client=Client(binary,session,env)
                init=client.rpc('initialize',{'protocolVersion':'2025-06-18','capabilities':{},'clientInfo':{'name':'puretv-smoke','version':'1'}})
                assert init['result']['serverInfo']['name']=='pureTV Manager',init
                names={t['name'] for t in client.rpc('tools/list')['result']['tools']}
                assert len(names)==20,names
                assert client.call('get_state')['adbAvailable']
                client.call('set_adb_path',{'path':str(adb)})
                client.call('pair',{'host':'192.168.1.50','port':33111,'code':'123456'})
                state=client.call('connect',{'host':'192.168.1.50','port':5555})
                assert state['device']['model']=='MCP Test TV'
                client.call('set_enabled',{'packages':['com.vendor.ads'],'enabled':False})
                assert next(p for p in client.call('get_state')['packages'] if p['packageName']=='com.vendor.ads')['enabled'] is False
                client.call('set_enabled',{'packages':['com.vendor.ads'],'enabled':True})
                protected=client.call('uninstall',{'packages':['com.android.systemui']},failure=True)
                assert protected['failedTargets'] and protected['snapshot']['history'][0]['success'] is False
                client.call('uninstall',{'packages':['com.vendor.ads']})
                client.call('restore',{'packages':['com.vendor.ads']})
                apk=root/'example.apk';apk.write_bytes(b'fake APK for simulated ADB')
                client.call('install',{'paths':[str(apk)]})
                client.call('set_home',{'component':'com.ecojust.cleanyourtv/.MainActivity'})
                assert client.call('get_state')['originalHome']=='com.stock.home/com.stock.home.Main'
                client.call('restore_home')
                assert client.call('get_state')['defaultHome']=='com.stock.home/com.stock.home.Main'
                assert client.call('platform_tools_info')['version']=='37.0.1'
                client.call('install_platform_tools',{'acceptedLicense':True},failure=True) # TV is connected: never downloads.
                invalid=client.rpc('tools/call',{'name':'install_platform_tools','arguments':{'acceptedLicense':False}})
                assert invalid['error']['code']==-32602
                (root/'slow').touch()
                pending=client.send('tools/call',{'name':'scan','arguments':{}})
                for _ in range(50):
                    if client.call('get_status')['running']:break
                    time.sleep(.05)
                else: raise AssertionError('Scan never became busy')
                client.call('clear_history',failure=True) # GUI and MCP share the busy gate.
                client.call('cancel')
                assert client.receive(pending)['result']['isError']
                (root/'slow').unlink()
                client.call('scan')
                client.call('clear_history')
                assert client.call('get_state')['history']==[]
                client.call('disconnect')
                assert client.call('get_state')['device'] is None
                # Pairing code never reaches saved state.
                saved=(session.parent/'state.json').read_text();assert '123456' not in saved
                gui.terminate();gui.wait(timeout=10)
                closed=client.rpc('tools/call',{'name':'get_state'})
                assert closed['error']['code']==-32603
                print('PASS: real GUI, MCP stdio, all device actions, protection, cancellation, and closed-window errors',flush=True)
            finally:
                if client:client.close()
                if gui.poll() is None:gui.terminate();gui.wait(timeout=10)

if __name__=='__main__': main()
