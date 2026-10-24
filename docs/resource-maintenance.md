# 维护 APK 资源

resource/ 的每个软件文件夹必须有实际 APK、resource.json、README、LICENSE 与 SHA256SUMS.txt。可附源码和 thumb.png，文件名保持在同一文件夹内。第三方二进制保留作者原始签名，更新时固定上游版本，核验其签名、包名、文件哈希和许可证。源码归档应对应 APK 的版本。

验证：

```bash
python tools/resource_catalog.py --build-tools "$ANDROID_HOME/build-tools/34.0.0"
python tools/update-resource-index.py
```

## 准备 pureTV 新版本

1. 修改版本、Android 代码与图标后提交，在 Android build 工作流手动触发 stage_resources=true。构建、测试和 APK 校验成功后，将公开的构建输入暂存到 build-assets/resources-运行编号；未签名 APK 不会作为正式发布附件。
2. 在本机设置 PURETV_KEYSTORE_PATH 和 PURETV_KEYSTORE_PASSWORD，使用既有 pureTV 发布密钥。密钥和密码不能进入 Git、源码归档或 Release。
3. 运行：

```bash
python tools/prepare-launcher-resource.py \
  --stage-branch build-assets/resources-运行编号 \
  --source-sha 构建对应的40位提交SHA \
  --build-tools "$ANDROID_HOME/build-tools/34.0.0"
```

脚本核验构建提交、源码树、APK 哈希、包名、版本和证书，签名后更新资源、对应源码、实际页面渲染图和索引。公开证书摘要固定在 tools/puretv-release-certificate.sha256；同包升级须保持证书。

4. 提交生成的资源，重新运行验证，再发布版本标签。Android 发布任务会从资源目录选择与当前 launcher 源码树一致的已验签 APK；没有对应签名资源时，标签发布检查失败。资源目录和 Release 使用相同文件。

提交资源和文档不改变 launcher 源码树，因此不需要再次编译；任何 launcher 源码、资源或 Gradle 输入变化都需要重新准备 APK。验证完成后可删除临时 build-assets 分支。源码中不包含发布私钥。
