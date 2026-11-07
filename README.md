# Daybook 内容仓库

这是 Daybook 主题的独立内容仓库示例。主题代码仓库通过 `CONTENT_REPO` 指向本目录，从而读取这里的内容与配置。

## 目录

```text
（内容仓库根目录）/  默认是主题仓库下的 content/
├─ post/       文章
├─ daily/      日记（Markdown / MDX）
├─ pages/      独立页面
├─ spec/       关于页正文（about.mdx）
├─ public/     静态资源（favicon、头像、图片、OG 图等）
└─ config/     站点配置（site.ts）与友链配置（links.ts）
```

内容模式下 Astro 的 `publicDir` 指向 `public/`，与主题仓库的 `public/` 完全隔离：主题模式的资源不会复制进内容模式的 `dist/`，站内统一用 `/images/...` 这样的根路径引用。

## 在主题仓库里使用

1. 在主题仓库的 `.env` 中配置内容仓库地址：

   ```dotenv
   # HTTP(S)：可以把 token 直接内联在 URL 中
   CONTENT_REPO_URL=https://oauth2:YOUR_TOKEN@example.com/you/daybook-content.git

   # 或者 SSH：还需要私钥路径
   # CONTENT_REPO_URL=git@example.com:you/daybook-content.git
   # CONTENT_REPO_SSH_KEY=~/.ssh/id_ed25519

   CONTENT_REPO_DIR=content
   ```

2. 克隆或拉取：

   ```bash
   pnpm content:clone
   pnpm content:pull
   ```

   示例骨架默认就在 `content/`，且不是 Git 仓库；如果要从远端 clone，先移走或删除示例内容，保证目标目录不存在或为空。已有内容仓库时直接 `pnpm content:pull`。

3. 使用内容模式：

   ```bash
   pnpm dev:content
   pnpm check:content
   pnpm build:content
   pnpm preview:content
   pnpm og:content
   ```

   `pnpm og:content` 会按本仓库的 `config/site.ts` 生成 `public/og-default.png`；修改站点标题、作者或 `since` 后重新运行并提交图片。

也可以临时指定目录：`pnpm dev:content --content-repo=../daybook-content`。

开发时保存 `post/`、`daily/`、`pages/`、`spec/` 下的文件会自动重载；修改 `config/site.ts` / `config/links.ts` 时，开发服务器会自动重启并重新读取配置，不需要手动停止再启动。

## 配置与类型

`config/site.ts` 和 `config/links.ts` 通过 `import type` 复用主题的类型：

```ts
// config/site.ts
import type { SiteConfigInput } from '../../src/types/config';

const siteConfig = {
  title: '我的日记',
  url: 'https://example.com',
  author: 'me',
} satisfies SiteConfigInput;

export default siteConfig;
```

```ts
// config/links.ts
import type { LinksConfigInput } from '../../src/types/config';

const linksConfig = {
  groups: [],
} satisfies LinksConfigInput;

export default linksConfig;
```

- `SiteConfigInput` / `LinksConfigInput` 是主题仓库的输入类型，字段可以省略；主题加载时会补全默认值并做 Zod 校验。
- `import type` 运行时会被擦除，内容仓库不需要安装主题依赖，也不需要复制一份类型。
- 默认路径假设本目录在主题仓库的 `content/` 下。若单独 clone 到主题目录之外，运行时仍能读取配置，但编辑器 / `tsc` 会找不到 `../../src/types/config`；需要独立类型检查时，把类型抽成共享包。
- 本目录的 `tsconfig.json` 可用于检查配置：在主题目录内执行 `pnpm exec tsc -p content/tsconfig.json --noEmit`。主题根 `pnpm check` 也会检查默认 `content/config` 下的配置。

## 把这个目录变成独立仓库

本目录默认被主题仓库的 `.gitignore` 忽略（`/content/`）。如果它还不是 Git 仓库，可以：

```bash
cd content
git init
git add .
git commit -m "init content"
git remote add origin <你的内容仓库地址>
git push -u origin main
```

之后在主题仓库里用 `pnpm content:pull` 更新内容。主题不会自动提交或推送内容仓库。
