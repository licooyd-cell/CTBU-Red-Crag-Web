# 红岩新声 · 青年创作档案

参赛者作品公开展示网站，包含搜索、分类筛选、个人故事页和专属二维码。管理员可在后台登录，直接添加、编辑、删除参赛者资料并上传作品封面。网站使用 Supabase Auth、Database 和 Storage；访客只读，写入权限由数据库行级安全策略控制。

## 本地预览

在项目目录运行：

```powershell
python -m http.server 8000
```

访问 `http://localhost:8000`。用户首次进入首页时会先选择“游客登录”或“管理员登录”：游客可直接浏览作品；管理员需要使用 Supabase Authentication 中已创建、并写入 `public.admin_users` 的账号登录。选择结果会保存在当前浏览器中，之后可直接进入首页；管理员也可以从页脚的“管理员入口”进入后台。

每个作品卡片和详情页都提供五级星级评分。评分会按作品保存在当前浏览器的 `localStorage` 中，适合访客的个人收藏式评价；如需统计所有访客的公共评分，需要另外增加 Supabase 评分表和匿名/用户标识策略。

## Supabase 管理后台配置

### 1. 创建 Supabase 项目和数据表

1. 在 [Supabase](https://supabase.com/) 创建一个项目。
2. 打开项目的 **SQL Editor**，执行 [`supabase/schema.sql`](./supabase/schema.sql) 中的全部 SQL。它会创建参赛者表、管理员授权表、公开图片存储桶以及 RLS 访问策略。
3. 在 **Authentication / Users** 中创建一个管理员用户，记录其邮箱。
4. 在 SQL Editor 中将该账号加入管理员名单，把邮箱替换为刚创建的邮箱后执行：

   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where email = 'admin@example.com'
   on conflict do nothing;
   ```

5. 在 Supabase 的 Authentication 设置中关闭公开注册。管理员账号由项目所有者创建和授权；其他已注册用户即使登录，也没有写入权限。

### 2. 配置网站连接

在 Supabase 项目的 **Connect / API Keys** 页面找到项目 URL 和 **publishable key**（或旧版 `anon` public key），填入 [`supabase-config.js`](./supabase-config.js)：

```js
window.SUPABASE_CONFIG = {
  url: "https://你的项目.supabase.co",
  publishableKey: "你的公开 publishable 或 anon key",
};
```

这个文件会随网站公开发布，所以只能填公开 key。**不要把 `service_role` / secret key 填入前端文件、聊天或网站。**数据库的 RLS 策略负责限制写操作。

### 3. 登录和维护作品

把整个网站目录部署到静态托管平台，并确认 `supabase-config.js` 与 `assets/` 一起上传。访问：

```text
https://你的公开域名/admin.html
```

用已授权的管理员邮箱和密码登录，即可新增、编辑或删除参赛者。每条资料支持一张作品封面（JPG、PNG 或 WebP，最大 10 MB），并可修改姓名、学号、院系、作品标题、简介和创作故事。保存后公开展览会直接读取数据库中的最新资料，无需重新部署静态网站。

> Supabase 项目负责数据库、登录和图片存储，不能直接替代静态网站托管。请把本目录部署到 Netlify、Vercel、GitHub Pages 或其他静态托管服务；Supabase Dashboard 的 Storage 只用于保存图片。

### 常见上传失败排查

- `Invalid API key` 或首页显示“作品资料暂时无法加载”：确认 `supabase-config.js` 使用的是当前项目的 **publishable key / anon public key**，不要复制 `service_role` 或 secret key；URL 必须是当前项目的 `https://xxxx.supabase.co`。
- `new row violates row-level security policy`：登录用户还没有管理员授权。先在 Authentication / Users 创建用户，再执行 README 第 1 步中的 `insert into public.admin_users` SQL。
- `The resource was not found`、`Bucket not found`：重新执行 `supabase/schema.sql`，确认 Storage 中存在名为 `artworks` 的公开 bucket。
- 上传后页面仍是空白：不要用 `file:///` 直接打开 HTML；在目录中运行 `python -m http.server 8000`，或部署到静态托管后再访问。
- 如果 SQL Editor 报错，请从头到尾复制 `supabase/schema.sql` 一次执行，并把报错文本保留下来；不要只执行 Storage 部分，因为管理员校验函数和 RLS 策略也必须存在。

管理员登录地址不是安全边界；实际读写权限由 Supabase 登录验证和 RLS 策略执行。不要给不可信用户添加 `admin_users` 授权。

## 发布、二维码和演示资料

未配置 Supabase 时会展示 `data.js` 中的演示资料。配置完成后，首页改为显示 Supabase 中的参赛者记录；刚创建的空数据库不会自动导入这些示例，请登录后台录入正式资料。二维码根据当前公开网址生成，部署后请从正式网站重新下载二维码。二维码库和 Supabase 浏览器 SDK 通过 CDN 加载，访问网站和后台时需要网络连接。
