# -*- coding: utf-8 -*-
"""
Bilibili 表情包数据获取与合并脚本 (自动获取面板数据)

功能:
1. 使用用户提供的 SESSDATA Cookie 调用 API (https://api.bilibili.com/x/emote/setting/panel) 获取原始表情包面板设置数据。
2. 从获取到的数据中的 'all_packages' 列表提取所有表情包的 ID。
3. 使用 Bilibili API (https://api.bilibili.com/x/emote/package) 分批次获取这些表情包的详细表情数据 (emote list)。
4. 将获取到的表情数据与原始包信息 (名称、图标 URL) 合并。
5. 按照指定的格式 (类似 emoji_data.json) 输出最终的完整表情包数据。

使用方法:
1. 确保已安装 Python 环境 (建议 Python 3.6+)。
2. 安装依赖库: pip install requests
3. 运行脚本: python bilibili_emoji_scraper_auto.py
4. 脚本运行时会提示您输入 Bilibili 账户的 SESSDATA 值。
   - 获取 SESSDATA: 登录 Bilibili 网页版，打开浏览器开发者工具 (通常按 F12)，切换到 "Application" (或 "存储") 标签页，在左侧找到 "Cookies" -> "https://www.bilibili.com"，找到名为 "SESSDATA" 的 Cookie，复制其值。
   - **警告: SESSDATA 是您的登录凭证，请勿泄露给他人！**
5. 合并后的完整数据将保存在 'bilibili_emoji_complete_data.json' (或修改脚本中的 FINAL_OUTPUT_FILE 变量) 文件中。
"""

import json
import requests
import time
import math
import os
import getpass # 用于安全地获取 SESSDATA 输入

# --- 配置项 ---
# 输出文件: 最终合并后的完整表情包数据文件路径
FINAL_OUTPUT_FILE = 'bilibili_emoji_complete_data.json'
# Bilibili API 端点
PANEL_API_URL = 'https://api.bilibili.com/x/emote/setting/panel'
PACKAGE_API_URL = 'https://api.bilibili.com/x/emote/package'
# API 请求批处理大小
BATCH_SIZE = 50
# API 请求之间的延迟（秒）
REQUEST_DELAY = 1
# 是否跳过没有表情的包
SKIP_EMPTY_PACKAGES = True 
# 基础 URL 占位符和实际基础 URL
BASE_URL_PLACEHOLDER = '{baseURL}'
ACTUAL_BASE_URL = 'https://i0.hdslb.com'
# --- 配置项结束 ---

def get_sessdata():
    """安全地获取用户输入的 SESSDATA"""
    print("\n获取 SESSDATA 方法:")
    print("1. 登录 Bilibili 网页版 (www.bilibili.com)。")
    print("2. 打开浏览器开发者工具 (通常按 F12)。")
    print("3. 切换到 'Application' (Chrome/Edge) 或 '存储' (Firefox) 标签页。")
    print("4. 在左侧找到 'Cookies' -> 'https://www.bilibili.com'。")
    print("5. 找到名为 'SESSDATA' 的 Cookie，复制其 'Value' (值)。")
    print("**警告: SESSDATA 是您的登录凭证，请勿泄露给他人！**")
    sessdata = getpass.getpass("请输入您的 Bilibili SESSDATA: ")
    return sessdata.strip()

def fetch_panel_data(sessdata):
    """使用 API 获取原始面板设置数据"""
    if not sessdata:
        print("错误: 未提供 SESSDATA。")
        return None
        
    params = {
        'business': 'reply'
    }
    cookies = {
        'SESSDATA': sessdata
    }
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    print(f"正在从 {PANEL_API_URL} 获取面板数据...")
    try:
        response = requests.get(PANEL_API_URL, params=params, cookies=cookies, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if data.get('code') == 0 and 'data' in data:
            print("面板数据获取成功。")
            return data['data'] # 返回 data 部分
        elif data.get('code') == -101: # 常见错误码：未登录
             print(f"错误: 面板 API 请求失败 - 未登录或 SESSDATA 无效/过期 (code={data.get('code')}, message={data.get('message')})。请检查 SESSDATA。")
             return None
        else:
            print(f"错误: 面板 API 请求失败或返回数据格式错误 (code={data.get('code')}, message={data.get('message')})。")
            return None
    except requests.exceptions.Timeout:
        print(f"错误: 面板 API 请求超时。")
        return None
    except requests.exceptions.RequestException as e:
        print(f"错误: 面板 API 请求异常: {e}")
        return None
    except json.JSONDecodeError as e:
        print(f"错误: 解析面板 API 响应 JSON 失败: {e}")
        return None

def fetch_package_emotes(package_ids):
    """使用 API 获取指定 ID 列表的表情包数据 (与之前脚本相同)"""
    if not package_ids:
        return {}
    
    params = {
        'business': 'reply',
        'ids': ','.join(map(str, package_ids))
    }
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(PACKAGE_API_URL, params=params, headers=headers, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if data.get('code') == 0 and 'data' in data and 'packages' in data['data']:
            return {str(pkg['id']): pkg for pkg in data['data']['packages'] if pkg and 'id' in pkg}
        else:
            print(f"警告: 表情包详情 API 请求失败或格式错误 (IDs: {package_ids[0]}...{package_ids[-1]}): code={data.get('code')}, message={data.get('message')}")
            return {}
    except requests.exceptions.Timeout:
        print(f"错误: 表情包详情 API 请求超时 (IDs: {package_ids[0]}...{package_ids[-1]}).")
        return {}
    except requests.exceptions.RequestException as e:
        print(f"错误: 表情包详情 API 请求异常 (IDs: {package_ids[0]}...{package_ids[-1]}): {e}")
        return {}
    except json.JSONDecodeError as e:
        print(f"错误: 解析表情包详情 API 响应 JSON 失败 (IDs: {package_ids[0]}...{package_ids[-1]}): {e}")
        return {}

def main():
    """主函数，执行整个获取和合并流程"""
    print("--- 开始执行 Bilibili 表情包数据获取与合并脚本 (自动获取面板数据) ---")
    
    # 0. 获取 SESSDATA
    sessdata = get_sessdata()
    if not sessdata:
        print("未提供有效的 SESSDATA，脚本终止。")
        return

    try:
        # 1. 调用 API 获取原始面板数据
        print("\n[1/4] 正在获取面板设置数据...")
        panel_data_content = fetch_panel_data(sessdata)
        if not panel_data_content:
            print("无法获取面板数据，脚本终止。")
            return

        # 检查面板数据结构
        if 'all_packages' not in panel_data_content:
            print(f"错误：获取到的面板数据结构不符合预期，缺少 'all_packages' 键。")
            return
        
        # 提取原始包信息，并创建 ID -> 包信息 的映射字典
        original_packages_list = panel_data_content['all_packages']
        original_packages_dict = {pkg['id']: pkg for pkg in original_packages_list if pkg and 'id' in pkg}
        package_ids_to_fetch = list(original_packages_dict.keys())
        total_original_packages = len(package_ids_to_fetch)
        print(f"从面板数据 'all_packages' 中找到 {total_original_packages} 个有效的表情包 ID。")

        # 2. 分批次调用 API 获取表情数据
        fetched_emotes_dict = {}
        num_batches = math.ceil(total_original_packages / BATCH_SIZE)
        
        print(f"\n[2/4] 开始调用 API 获取表情包详情数据 (共 {num_batches} 批次, 每批 {BATCH_SIZE} 个 ID)...")
        for i in range(num_batches):
            start_index = i * BATCH_SIZE
            end_index = start_index + BATCH_SIZE
            batch_ids = package_ids_to_fetch[start_index:end_index]
            
            print(f"  正在获取第 {i+1}/{num_batches} 批 (IDs: {batch_ids[0]}...{batch_ids[-1]})...")
            batch_result = fetch_package_emotes(batch_ids)
            fetched_emotes_dict.update(batch_result)
            print(f"  第 {i+1} 批获取完成。当前已获取 {len(fetched_emotes_dict)} 个包的数据。")
            
            if i < num_batches - 1:
                time.sleep(REQUEST_DELAY)

        print(f"API 表情包详情数据获取完成。成功获取了 {len(fetched_emotes_dict)} 个表情包的详细数据。")

        # 3. 合并原始信息和获取到的表情数据
        print("\n[3/4] 开始合并数据...")
        merged_packages_list = []
        processed_count = 0
        skipped_due_to_missing_fetch = 0
        skipped_due_to_no_emotes = 0

        for pkg_id in package_ids_to_fetch:
            original_pkg_info = original_packages_dict.get(pkg_id)
            fetched_pkg_data = fetched_emotes_dict.get(str(pkg_id))

            if not original_pkg_info: continue
            if not fetched_pkg_data:
                skipped_due_to_missing_fetch += 1
                continue

            merged_pkg = {
                'id': pkg_id,
                'text': original_pkg_info.get('text', ''),
                'icon': original_pkg_info.get('url', '').replace(ACTUAL_BASE_URL, BASE_URL_PLACEHOLDER),
                'emojis': []
            }

            if 'emote' in fetched_pkg_data and isinstance(fetched_pkg_data['emote'], list):
                for emote in fetched_pkg_data['emote']:
                    name = ''
                    if 'meta' in emote and isinstance(emote['meta'], dict) and emote['meta'].get('alias'):
                        name = emote['meta']['alias']
                    elif 'text' in emote:
                        name = emote['text'].strip('[]')
                    
                    url = emote.get('url', '').replace(ACTUAL_BASE_URL, BASE_URL_PLACEHOLDER)

                    if name and url:
                        merged_pkg['emojis'].append({'name': name, 'url': url})
            
            if merged_pkg['emojis']:
                merged_packages_list.append(merged_pkg)
                processed_count += 1
            elif not SKIP_EMPTY_PACKAGES:
                 merged_packages_list.append(merged_pkg)
                 processed_count += 1
                 skipped_due_to_no_emotes += 1
            else:
                skipped_due_to_no_emotes += 1

        print("数据合并完成。")
        print(f"  成功合并了 {processed_count} 个表情包。")
        if SKIP_EMPTY_PACKAGES:
            print(f"  跳过了 {skipped_due_to_no_emotes} 个因为没有表情数据的包。")
        else:
             print(f"  其中 {skipped_due_to_no_emotes} 个包没有表情数据但仍被包含。")
        print(f"  跳过了 {skipped_due_to_missing_fetch} 个因为详情 API 未返回数据的包。")

        # 4. 保存最终结果到文件
        final_data = {'packages': merged_packages_list}
        print(f"\n[4/4] 正在将最终结果写入文件: {FINAL_OUTPUT_FILE}")
        with open(FINAL_OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(final_data, f, ensure_ascii=False, indent=2)
        print("最终结果写入成功。")
        print(f"--- 脚本执行完毕 --- 文件已保存至: {FINAL_OUTPUT_FILE}")

    except json.JSONDecodeError as e:
        print(f"错误：解析 JSON 文件时出错: {e}")
    except requests.exceptions.ConnectionError as e:
        print(f"错误：网络连接失败，请检查网络连接或 API 地址: {e}")
    except Exception as e:
        print(f"处理过程中发生未知错误: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()

