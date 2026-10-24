#!/usr/bin/env python3
"""Render README tables from APK resource metadata, without placeholder entries."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
entries=[(folder.name,json.loads((folder/'resource.json').read_text())) for folder in sorted((root/'resource').iterdir()) if folder.is_dir()]
def tables(prefix):
    output=[]
    for kind,title in [('launcher','启动器'),('app','电视应用')]:
        output+=['### '+title,'']
        output+=['| 名称 | 作者 | 版本 | '+('支持自定义' if kind=='launcher' else '用途')+' | 封面截图 |','| --- | --- | --- | --- | --- |']
        for key,info in entries:
            if info['kind']!=kind:continue
            directory=prefix+key+'/'
            image=f'<img src="{directory+info["cover"]}" width="180" alt="{info["name"]} 界面">' if info.get('cover') else '—'
            extra=('是' if info.get('supportsLayoutJson') and info.get('layoutJsonVersion')==2 else '否') if kind=='launcher' else info.get('description','电视应用')
            output.append(f'| [{info["name"]}]({directory}) | {info["author"]} | {info["version"]} | {extra} | {image} |')
        output+=['']
    return '\n'.join(output).rstrip()
p=root/'README.md';text=p.read_text();start='<!-- resource-index:start -->';end='<!-- resource-index:end -->';left=text.index(start)+len(start);right=text.index(end);p.write_text(text[:left]+'\n\n'+tables('resource/')+'\n\n'+text[right:])
(root/'resource/README.md').write_text('# 电视 APK 资源目录\n\n每个资源文件夹至少包含一个真实 APK，以及 resource.json、许可证和校验文件；可附对应源码及封面。点击软件名称进入文件夹下载。第三方 APK 保持上游原始二进制与签名。\n\n“支持自定义”指 pureTV 管理器画布使用的 layout.json 版本 2 接口。上游截图、纯 TV 渲染示例与相关许可见各文件夹说明。\n\n'+tables('')+'\n\n维护校验：`python tools/resource_catalog.py --build-tools <Android Build Tools 34.0.0 目录>`。索引由 `python tools/update-resource-index.py` 根据资源元数据生成。\n')
