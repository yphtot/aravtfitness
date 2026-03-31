@echo off
echo ================================================
echo   АРАВТ ФИТНЕСС - Сервер эхлүүлж байна...
echo ================================================
echo.

:: npm суулгасан эсэхийг шалгах
where npm >nul 2>&1
if errorlevel 1 (
    echo [АЛДАА] Node.js суулгаагүй байна!
    echo.
    echo Доорх холбоосоос Node.js татаж суулгана уу:
    echo https://nodejs.org  (LTS хувилбарыг сонгоно уу)
    echo.
    echo Суулгасны дараа энэ файлыг дахин ажиллуулна уу.
    pause
    exit
)

:: node_modules байхгүй бол суулгах
if not exist "node_modules" (
    echo [1/2] Хэрэгцээт файлуудыг татаж авч байна...
    npm install
    echo.
)

:: data хавтас үүсгэх
if not exist "data" mkdir data

echo [2/2] Сервер ажиллаж байна...
echo.
echo   Вэбсайт:  http://192.168.1.12:5500  (Live Server)
echo   API:      http://127.0.0.1:3000     (Node.js)
echo   Admin:    http://127.0.0.1:3000/admin.html
echo.
echo   (Зогсоохдоо Ctrl+C дарна уу)
echo.
node server.js
pause
