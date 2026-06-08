# 🚀 NitPark — מדריך הפעלה לפרודקשן

## מה נבנה
- ✅ Capacitor — עוטף את האפליקציה ל-iOS + Android
- ✅ Stripe — תשלום אמיתי בכרטיס אשראי
- ✅ Firebase Phone Auth — SMS OTP אמיתי
- ✅ Firebase Cloud Functions — backend מאובטח
- ✅ Firestore — בסיס נתונים אמיתי

---

## שלב 1 — חשבון Stripe

1. כנס ל https://stripe.com ולחץ "Start now"
2. מלא פרטי עסק
3. לאחר ההרשמה — לך ל **Developers → API Keys**
4. העתק:
   - `Publishable key` (מתחיל ב-`pk_test_...`)
   - `Secret key` (מתחיל ב-`sk_test_...`)

### הכנס את המפתחות לקוד:

**`js/stripe.js`** — שורה 7:
```js
const STRIPE_PUBLIC_KEY = 'pk_test_YOUR_KEY_HERE';
```

---

## שלב 2 — Firebase Cloud Functions

### התקנה:
```bash
# התקן Firebase CLI
npm install -g firebase-tools

# כנס לפרויקט
cd Desktop/NitPark

# התחבר לFirebase
firebase login

# הגדר את Stripe Secret Key
firebase functions:config:set stripe.secret="sk_test_YOUR_SECRET_KEY"
firebase functions:config:set stripe.webhook_secret="whsec_YOUR_WEBHOOK_SECRET"

# התקן dependencies של Functions
cd functions
npm install
cd ..

# פרוס את הפונקציות
firebase deploy --only functions
```

### לאחר הפריסה — עדכן את ה-URL:
**`js/stripe.js`** — שורה 10:
```js
const PAYMENT_FUNCTION_URL = 'https://europe-west1-prkint-749da.cloudfunctions.net/createPaymentIntent';
```
(ה-URL הזה כבר נכון — רק ודא שה-region הוא `europe-west1`)

---

## שלב 3 — SMS אמיתי (Firebase Phone Auth)

### הפעל Phone Auth:
1. Firebase Console → **Authentication → Sign-in method**
2. לחץ על **Phone** והפעל אותו
3. לך ל **Settings → Authorized domains**
4. הוסף את הדומיין שלך (לדוגמה: `nitpark.co.il`)

### לבדיקה לפני Production:
- לך ל **Authentication → Phone numbers for testing**
- הוסף `+972501234567` עם קוד `123456`
- כך תוכל לבדוק SMS בלי לשלם על הודעות

---

## שלב 4 — הכנסת האפליקציה לחנות

### התקנת Capacitor:
```bash
cd Desktop/NitPark
npm install

# צור פרויקט Android
npx cap add android

# צור פרויקט iOS (דורש Mac עם Xcode)
npx cap add ios

# סנכרן את הקוד
npx cap sync
```

### Android (Google Play):
```bash
npx cap open android
# נפתח Android Studio → Build → Generate Signed Bundle/APK
```
- דרוש: [Google Play Developer Account](https://play.google.com/console) — $25 חד פעמי
- זמן אישור: 1-3 ימים

### iOS (App Store):
```bash
npx cap open ios
# נפתח Xcode → Product → Archive → Distribute
```
- דרוש: [Apple Developer Account](https://developer.apple.com) — $99/שנה
- דרוש: Mac עם Xcode
- זמן אישור: 1-7 ימים

---

## שלב 5 — Firebase Hosting (אתר אינטרנט)

```bash
firebase deploy --only hosting
```
האפליקציה תהיה זמינה ב:
`https://prkint-749da.web.app`

---

## סיכום מה שנדרש ממך

| פעולה | עלות | זמן |
|-------|------|-----|
| חשבון Stripe | חינם + 1.4%-2.9% מכל עסקה | 10 דקות |
| Google Play Developer | $25 חד פעמי | 10 דקות |
| Apple Developer | $99/שנה | 30 דקות |
| Firebase (Blaze plan) | חינם עד מכסה גדולה | 5 דקות |
