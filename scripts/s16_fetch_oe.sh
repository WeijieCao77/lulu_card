#!/usr/bin/env bash
# 下载 Oracle's Elixir 2026 逐场比赛数据（S16 评分用，scripts/s16_ratings.py --oe）。
# 同 lol选手/data/fetch_oe.sh 的 Google Drive 文件编号；Drive 常提示「下载配额已满」，所以隔一阵重试。
# 下到 2026_OE.new.csv，确认是 CSV 再替换 2026_OE.csv（旧文件留作 2026_OE.prev.csv）。
#   bash scripts/s16_fetch_oe.sh [重试次数，默认 6] [间隔秒，默认 300]
set -uo pipefail
DIR="$HOME/OneDrive/桌面/lol选手/data/oracleselixir"
[ -d "$DIR" ] || DIR="/c/Users/15967/OneDrive/桌面/lol选手/data/oracleselixir"
cd "$DIR" || { echo "找不到 $DIR"; exit 2; }
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
TRIES="${1:-6}"; GAP="${2:-300}"
for i in $(seq 1 "$TRIES"); do
  curl -sSL --max-time 600 -A "$UA" "https://drive.usercontent.google.com/download?id=1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm&export=download&confirm=t" -o 2026_OE.new.csv
  sz=$(wc -c < 2026_OE.new.csv 2>/dev/null || echo 0)
  if [ "$sz" -gt 1000000 ] && head -c 40 2026_OE.new.csv | grep -q "gameid"; then
    [ -f 2026_OE.csv ] && mv -f 2026_OE.csv 2026_OE.prev.csv
    mv -f 2026_OE.new.csv 2026_OE.csv
    echo "OK $sz bytes, WLDs rows: $(grep -c ',WLDs,' 2026_OE.csv)"
    exit 0
  fi
  echo "[try $i] $sz bytes（多半是 Drive 配额已满），${GAP}s 后再试"
  rm -f 2026_OE.new.csv
  [ "$i" -lt "$TRIES" ] && sleep "$GAP"
done
echo "FAILED"
exit 1
