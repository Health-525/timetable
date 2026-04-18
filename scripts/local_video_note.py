#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地视频笔记生成器
用法：python local_video_note.py <YouTube链接> [输出目录]

依赖：pip install faster-whisper yt-dlp
"""

import sys
import os
import re
import tempfile
import subprocess
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

# ── 配置 ──────────────────────────────────────────────────────────

DEFAULT_OUT_DIR = Path(__file__).parent.parent / "jiangshu-study" / "youtube-daily"
WHISPER_MODEL   = "base"   # tiny / base / small / medium
WHISPER_DEVICE  = "cpu"
WHISPER_COMPUTE = "int8"   # CPU 下用 int8 最快

# ── 工具 ──────────────────────────────────────────────────────────

def today_shanghai():
    return datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y-%m-%d")

def extract_video_id(url):
    m = re.search(r"[?&]v=([^&]+)", url)
    return m.group(1) if m else "unknown"

# ── yt-dlp 下载音频 ───────────────────────────────────────────────

def get_ffmpeg_path():
    """自动查找 ffmpeg，优先用 imageio-ffmpeg 内置的"""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"

def download_audio(url, tmp_dir):
    out_tpl = str(Path(tmp_dir) / "%(id)s.%(ext)s")
    ffmpeg_path = get_ffmpeg_path()
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "-x",                          # 只提取音频
        "--audio-format", "mp3",
        "--audio-quality", "5",        # 0最好 9最差，5够用
        "--ffmpeg-location", ffmpeg_path,
        "--js-runtimes", "node:C:/Program Files/nodejs/node.exe",
        "--remote-components", "ejs:github",
        "--user-agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "-o", out_tpl,
        url,
    ]
    cookies_file = os.environ.get("YOUTUBE_COOKIES_FILE", "")
    if cookies_file and Path(cookies_file).exists():
        cmd += ["--cookies", cookies_file]
        print(f"[yt-dlp] 使用 cookies: {cookies_file}")

    print(f"[yt-dlp] 下载音频: {url}")
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(f"[yt-dlp] 失败:\n{r.stderr[:600]}")
        return None, None

    # 找到下载的文件
    files = list(Path(tmp_dir).glob("*.mp3"))
    if not files:
        files = list(Path(tmp_dir).glob("*.m4a")) + list(Path(tmp_dir).glob("*.webm"))
    if not files:
        print("[yt-dlp] 未找到音频文件")
        return None, None

    audio_path = str(files[0])
    print(f"[yt-dlp] 音频: {audio_path}")

    # 获取标题
    title_cmd = ["yt-dlp", "--no-playlist", "--get-title", url]
    tr = subprocess.run(title_cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    title = tr.stdout.strip() or "未知标题"
    print(f"[yt-dlp] 标题: {title}")

    return audio_path, title

# ── Whisper 转写 ──────────────────────────────────────────────────

def transcribe(audio_path):
    from faster_whisper import WhisperModel

    print(f"[whisper] 加载模型 {WHISPER_MODEL}（首次运行会下载约150MB）...")
    model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE)

    print("[whisper] 转写中...")
    segments, info = model.transcribe(
        audio_path,
        beam_size=5,
        language=None,          # 自动检测语言
        vad_filter=True,        # 过滤静音
        vad_parameters={"min_silence_duration_ms": 500},
    )

    detected = info.language
    print(f"[whisper] 检测语言: {detected}")

    lines = []
    for seg in segments:
        ts = f"[{seg.start:06.1f}s]"
        lines.append(f"{ts} {seg.text.strip()}")

    transcript = "\n".join(lines)
    print(f"[whisper] 转写完成，共 {len(lines)} 段")
    return transcript

# ── 生成 Markdown ─────────────────────────────────────────────────

def build_md(title, url, transcript, date):
    lines = [
        f"# {title}",
        "",
        f"> 来源：[{title}]({url})",
        f"> 日期：{date}",
        "",
        "## 字幕转写",
        "",
    ]
    lines.append(transcript)
    lines.append("")
    return "\n".join(lines)

# ── 主流程 ────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("用法: python local_video_note.py <YouTube链接> [输出目录]")
        sys.exit(1)

    url = sys.argv[1]
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    date = today_shanghai()
    video_id = extract_video_id(url)

    with tempfile.TemporaryDirectory() as tmp:
        # 1. 下载音频
        audio_path, title = download_audio(url, tmp)
        if not audio_path:
            print("[error] 音频下载失败，退出")
            sys.exit(1)

        # 2. Whisper 转写
        transcript = transcribe(audio_path)

    # 3. 写入 Markdown
    md = build_md(title, url, transcript, date)
    out_file = out_dir / f"{date}-{video_id}.md"
    out_file.write_text(md, encoding="utf-8")
    print(f"\n[done] 笔记已保存: {out_file}")

if __name__ == "__main__":
    main()
