# EDIMAGE WORLD 部署说明

## 推荐方案

当前版本最适合先部署到 Render，再把 `edimage.art` 绑定过去。

原因：

1. 这个项目是一个 Node 服务，不只是纯静态页面。
2. 项目会写入 `ACCESS-STATE.json`、`KNOWLEDGE-BASE.md`、`EASTER-EGG-LIBRARY.md`。
3. Render 免费版可以先把 MVP 放上公网；如果以后要稳定保存知识库和邀请码次数，再接免费数据库或升级持久磁盘。

## 当前项目的公网运行要求

部署时至少需要设置这些环境变量：

```env
APP_BASE_URL=https://edimage.art
DATA_DIR=.
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

## 免费版注意事项

1. Render 免费版会在空闲时休眠，首次访问可能等待几十秒。
2. Render 免费版没有持久磁盘，本地写入的知识库和邀请码次数在重启、重新部署后可能丢失。
3. 免费阶段可以先用于朋友体验；如果要长期保存数据，建议把访问次数和知识库迁到 Supabase 免费数据库。
3. 上公网前建议轮换一次 OpenRouter API key，并把旧 key 作废。
