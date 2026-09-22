# TrenchScore

非官方浏览器插件。在 [GMGN](https://gmgn.ai) 战壕里，用你自己的 [Jev](https://typesafe.ai) Key 给每个币打分，分数直接显示在币名后面。

不隶属 GMGN，也不隶属 TypeSafe。插件不会下单，也不会读取你的钱包私钥。分数不是买卖建议。

## 分数是什么

Jev 不写一段分析。它看的是这张卡片上已经出现的公开字段，在 1 到 5 档里给一个位置。币名后面显示成星：

| 档位 | 显示 | 含义 |
| --- | --- | --- |
| 1 | ★☆☆☆☆ | 很差 |
| 2 | ★★☆☆☆ | 较差 |
| 3 | ★★★☆☆ | 一般 |
| 4 | ★★★★☆ | 较好 |
| 5 | ★★★★★ | 很好 |

0 不是 Jev 打出来的一档。硬条件没过的币不请求 Jev，币名后面是五颗空心星 `☆☆☆☆☆`。悬停可以看到原因：洗盘、可增发、可冻结、高税、rug、捆绑、老鼠仓、前十、机器人、连环盘。前十和机器人要先有至少 20 个持币人。卡片上没有对应字段时放过。开关和数字在弹窗里改。

悬停可以看到几星。置信度低于 40% 时，星星带虚线框。同一份数据会缓存，市值的小幅跳动不会重复扣费。

卡片上有的字段才会发出去，没有的会省掉。除了市值、流动性、持仓比例、捆绑、老鼠仓、开发者历史和是否洗盘，还会带上这些：

- 规模和活跃：24 小时成交额、买卖笔数、手续费、创建了多久、内盘进度、发射平台、交易池
- 持仓结构：持币人数、诱捕、新钱包、疑似内部人、开发者团队持仓、创建者余额、机器人、私有金库、狙击手、买卖税、rug、烧币比例、是否放弃增发和冻结
- 社交：只发有没有推特、网站、电报。另外带上这条链接被多少个币用过、推特改过几次名、推特是否改过。链接正文和图片都不发
- 其他：名字和符号、图片被多少个币用过、是否洗盘、是否 CTO、是否链下

名字和「有社交链接」不会被当成这枚币可靠的证据。

## 安装

1. 用 Chrome 或 Edge 打开 `chrome://extensions`。
2. 打开右上角「开发者模式」。
3. 选「加载已解压的扩展程序」，指向本目录（包含 `manifest.json` 的这一层）。
4. 打开插件弹窗，粘贴 Jev API Key。Key 在 [console.typesafe.ai](https://console.typesafe.ai) 创建。
5. 点「测试 Key」。通了之后打开 GMGN 战壕，例如 `https://gmgn.ai/?chain=sol`，刷新一次。

币名后面会出现 `…`，打分完成后变成星星。左下角的 `JEV` 状态条表示正在打分或已经打完。

## 供应商

弹窗里的「供应商地址」和「模型」要成对改，改完先保存，再点「测试 Key」。Key 也不能串用：TypeSafe 的 Key 不能拿去调 OpenRouter 或 Vercel。地址要填接口路径，不要填官网、控制台或文档页，那些页面返回的是 HTML。

第一次保存自定义地址时，浏览器会再要一次访问该网站的权限，需要允许。

| 供应商 | 供应商地址 | 模型 | Key |
| --- | --- | --- | --- |
| TypeSafe | `https://api.typesafe.ai/v1/systemone` | `jev-latest` | [console.typesafe.ai](https://console.typesafe.ai) |
| OpenRouter | `https://openrouter.ai/api/v1/systemone` | `jev-latest` | `sk-or-v1-...` |
| OpenRouter，模型页上的接口 | `https://openrouter.ai/api/alpha/decisions` | `~typesafe/jev-latest` | `sk-or-v1-...` |
| Vercel，保留置信度 | `https://ai-gateway.vercel.sh/typesafe/v1/systemone` | `typesafe-ai/jev` | AI Gateway |
| Vercel `/v1/evaluate` | `https://ai-gateway.vercel.sh/v1/evaluate` | `typesafe-ai/jev` | AI Gateway |

OpenRouter 的 `jev-latest` 只在 `/api/v1/systemone` 上会被改写成 `~typesafe/jev-latest`。走 `/api/alpha/decisions` 时，模型要自己写成 `~typesafe/jev-latest`。Vercel 不认 `jev-latest`，模型用 `typesafe-ai/jev`。

`/v1/evaluate` 的星星能出来。它的置信度不在答案上，悬停不会出现虚线框。要用虚线框，填上面 Vercel 那条 `/typesafe/v1/systemone`。

Cloudflare Workers AI 的模型是 `typesafe/jev`，但请求要包在 `input` 里，结果也包在 `result` 里。只改地址和模型不够，插件现在对不上。

## 隐私

- Key 存在 `chrome.storage.local`。默认请求发给 `https://api.typesafe.ai/v1/systemone`。弹窗里可以改成别的供应商地址，请求体仍然是 System One 的 `state` + `questions`。页面脚本读不到 Key。
- 发出去的是战壕卡片上的公开字段：合约地址、符号、市值、持仓和风险比例、有没有社交链接。不发图片，不发开发者钱包地址，不发你的 GMGN 登录态。
- 模型默认 `jev-latest`。可以在弹窗里改成固定版本，例如 `jev-1.13.0`。

## 开发

逻辑测试不需要浏览器：

```bash
node --test test/lib.test.js
```

战壕卡片的选择器是 `data-testid="trench-token-card"`。代币详情页（例如 `/sol/token/地址`）把同一套星星放在币名 `token-detail-symbol` 后面，用的还是这张币的公开结构数据。GMGN 改版后如果分数不再出现，先看左下角状态，再看这两个选择器还在不在。

## 许可

MIT。见 [LICENSE](LICENSE)。
