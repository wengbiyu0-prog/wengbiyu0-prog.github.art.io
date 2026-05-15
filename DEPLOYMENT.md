# EDIMAGE WORLD 部署说明

## 推荐方案

当前版本最适合先部署到 Render，再把 `edimage.art` 绑定过去。

原因：

1. 这个项目是一个 Node 服务，不只是纯静态页面。
2. 项目会写入 `ACCESS-STATE.json`、`KNOWLEDGE-BASE.md`、`EASTER-EGG-LIBRARY.md`。
3. Render 支持自定义域名和持久磁盘，适合先把 MVP 放上公网。

## 当前项目的公网运行要求

部署时至少需要设置这些环境变量：

```env
PORT=10000
APP_BASE_URL=https://edimage.art
DATA_DIR=/var/data
OPENROUTER_API_KEY=你的 OpenRouter key
OPENROUTER_MODEL=deepseek/deepseek-chat
INVITE_CODE=edimage-world
DEVELOPER_CODE=edithfish
INVITE_LIMIT=10
```

## Render 上线步骤

1. 把项目放到 GitHub 仓库。
2. 在 Render 新建 `Web Service`。
3. 连接 GitHub 仓库。
4. 让 Render 读取仓库里的 `render.yaml`。
5. 在 Render 后台补上 `OPENROUTER_API_KEY` 等私密环境变量。
6. 首次部署成功后，打开 `https://你的-render-域名/api/health` 检查服务状态。
7. 在 Render 的 `Custom Domains` 中添加：

```txt
edimage.art
www.edimage.art
```

8. 回到域名 DNS 管理后台，按 Render 提示添加记录。
9. 等待 SSL 证书签发完成。

## 注意事项

1. 现在的邀请码次数和知识库内容依赖本地文件存储，已经通过 `DATA_DIR` 支持持久磁盘。
2. 如果未来体验人数变多，建议把这些数据迁到数据库。
3. 上公网前建议轮换一次 OpenRouter API key，并把旧 key 作废。
