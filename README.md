# Daily Plan · 30-day Challenge  (برنامه روزانه · چالش ۳۰ روزه)

Interactive, fillable planner: cover, 30-day calendar tracker, and 30 daily pages.
English (LTR) and Farsi (RTL, Jalali calendar). Works on phone and desktop, installable, works offline.
Password-protected on Vercel.

## Deploy on Vercel

You need the **whole folder** (not just `public/`).

### Option A — GitHub (easiest to update later)
1. Create a **private** GitHub repo and upload everything in this folder.
2. Vercel → *Add New… → Project* → import the repo.
3. Framework Preset: **Other**. Leave Build/Output settings as they are (`vercel.json` already sets them).
4. Open *Environment Variables*, add  `SITE_PASSWORD` = your password (use something long), for Production.
5. Deploy.

### Option B — Vercel CLI
```
npm i -g vercel
cd daily-plan
vercel                                   # first deploy (accept defaults)
vercel env add SITE_PASSWORD production  # type your password
vercel --prod
```

Changed the password later? Edit `SITE_PASSWORD` in Project Settings → Environment Variables, then **redeploy**.
Everyone gets signed out and must use the new one.

## How the protection works
`middleware.js` runs on Vercel before *any* file is served. Without the login cookie, visitors only ever
see `login.html`. The password is only in the environment variable, never in the code.
Note: your planner entries are stored **on each device** (browser storage); the password controls who can open the site.

## Using it
- Everything saves automatically on the device. Use ⋯ → **Export backup** to move data between phone and computer
  (then **Import backup** on the other device). Print/Save PDF is in the same menu.
- iPhone: Safari → Share → *Add to Home Screen*.  Android/Chrome/desktop: *Install app* (menu or address bar).
- Language toggle (فارسی / EN) is in the top bar. Calendar system (Jalali / Gregorian) is in ⋯.

## When you edit files
Bump `VERSION` in `public/sw.js` so installed copies pick up the update.

## Structure
```
middleware.js      password gate (Vercel Routing Middleware)
api/login.js       checks password, sets cookie
vercel.json        output dir + headers
public/            the app (index.html, login.html, assets/, icons/, sw.js, manifest)
```
---
## راهنمای سریع (فارسی)
۱. کل پوشه را در یک ریپوی **خصوصی** گیت‌هاب بگذارید و در Vercel ایمپورت کنید (Framework: Other).
۲. در Environment Variables مقدار `SITE_PASSWORD` را با رمز دلخواه (بلند) بسازید و Deploy بزنید.
۳. اطلاعات هر دستگاه روی همان دستگاه ذخیره می‌شود؛ برای انتقال بین گوشی و کامپیوتر از منوی ⋯ گزینهٔ «دانلود نسخه پشتیبان» و «بازیابی» استفاده کنید.
۴. آیفون: Safari ← Share ← Add to Home Screen. اندروید و کامپیوتر: «نصب برنامه».
