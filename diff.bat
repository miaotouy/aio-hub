@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: 获取当前日期时间（格式: YYYY-MM-DD_HH-MM-SS）
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set YYYY=%dt:~0,4%
set MM=%dt:~4,2%
set DD=%dt:~6,2%
set HH=%dt:~8,2%
set MI=%dt:~10,2%
set SS=%dt:~12,2%

set filename=temp_gitdiff_%YYYY%-%MM%-%DD%_%HH%-%MI%-%SS%.txt

:: 将未跟踪的文件标记为已跟踪，以便 git diff 能捕获到它们
git add -N .
git diff HEAD --output %filename%

echo 已生成: %filename%
endlocal