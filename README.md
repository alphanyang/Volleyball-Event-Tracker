
**Volleyball Events Bot**
-
**Getting Set-up**
*First we need to install a couple of Node.js packages*
`npm install playwright dotenv random-useragent nodemailer`

- **Playwright**: scrape, navigate, and interact with the website.
- **dotenv**: read our .env file.
- **Random-Useragent**: prevent layer anti-bot measurements by switching up our connection device
- **NodeMailer**: notify our user about their game.

---
**Setting up an environment file**

Create a file named `.env` containing these variables
```// Login configuration
YOUR_EMAIL = // opensports.net email
YOUR_PASSWORD = // opensports.net password

// Email configuration
EMAIL_USER = // notifier origin email
// I suggest you make an app password for your gmail
EMAIL_PASS = // notifier origin email password, 
NOTIFICATION_EMAIL = // Notification reciever```