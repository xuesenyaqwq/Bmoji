![loli](https://count.getloli.com/@Bmoji?name=Bmoji&theme=gelbooru&padding=7&offset=0&align=top&scale=1&pixelated=1&darkmode=auto)

本仓库所有内容都基于 manus.im 生成

## 使用说明

### 爬取脚本 bilibili_emoji_auto.py

1. 确保已安装 Python 环境 (建议 Python 3.6+)。
2. 安装依赖库: pip install requests
3. 运行脚本: python bilibili_emoji_scraper_auto.py
4. 脚本运行时会提示您输入 Bilibili 账户的 SESSDATA 值。
   - 获取 SESSDATA: 登录 Bilibili 网页版，打开浏览器开发者工具 (通常按 F12)，切换到 "Application" (或 "存储") 标签页，在左侧找到 "Cookies" -> " https://www.bilibili.com "，找到名为 "SESSDATA" 的 Cookie，复制其值。
   - **警告: SESSDATA 是您的登录凭证，请勿泄露给他人！**
5. 合并后的完整数据将保存在 'bilibili_emoji_complete_data.json' (或修改脚本中的 FINAL_OUTPUT_FILE 变量) 文件中。

### 网站配置 data/config.json

```
{
    "servers": [
        {
            "id": "origin",
            "name": "源站 (Origin)",
            "baseUrl": "https://i0.hdslb.com",
            "noReferrer": true
        },
        {
            "id": "ID",
            "name": "切换列表显示名字",
            "baseUrl": "https://example.com",
            "noReferrer": false //是否启用Referrer，B站有防盗链，但允许空白Referrer访问
        }
    ]
}

```
记得配置文件不要有注释，我写只是为了易读，写了会报错
> 添加自己的网站有什么用？
> 或许可以配置一个代理，来反向代理 https://i0.hdslb.com 这样就可以不用空白Referrer而在自己的网页上使用了
