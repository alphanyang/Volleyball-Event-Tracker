const playwright = require('playwright')
const random_useragent = require("random-useragent")
const fs = require('fs')
const dotenv = require('dotenv')
const nodemailer = require('nodemailer');

dotenv.config()

const BASE_URL = 'https://opensports.net/discovery'
const CITY = 'Philadelphia, PA'
const NOTIFIED_EVENTS_FILE = 'notified_events.json';

const LOGIN_EMAIL = process.env.YOUR_EMAIL
const LOGIN_PASSWORD = process.env.YOUR_PASSWORD

// Email configuration
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL;

async function checkJoinability(page, event) {
    try {
        await page.goto(event.link, { waitUntil: 'networkidle' });
        const waitlistButton = await page.$('button.Game_joinGameButton__a_XW1:has-text("Join Waitlist")')
        if (waitlistButton) {
            console.log(`Event at ${event.link} is full, joining waitlist instead`);
            await waitlistButton.click();
            // Login process
            const isEmailVisible = await page.isVisible('input[type=email]');
            if (isEmailVisible) {
                await page.fill('input[type=email]', LOGIN_EMAIL);
                await page.waitForLoadState('networkidle');
                await page.click('button:has-text("Continue with Email")');
                await page.fill('input[type=password]', LOGIN_PASSWORD);
                await page.waitForLoadState('networkidle');
                await page.click('button:has-text("Log in")');
            }
            return true;
        }
        const joinButton = await page.$('button.Game_joinGameButton__a_XW1:has-text("Join")');
        return !!joinButton; // Returns true if join button exists, false otherwise
    } catch (error) {
        console.error(`Error checking joinability for ${event.link}:`, error);
        return false;
    }
}

async function joinEvent(page, url) {
    let retries = 3
    while (retries > 0) {
        try {
            console.log(`Navigating to ${url}`)
            await page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded' })
            await page.waitForLoadState('networkidle', { timeout: 60000 })

            const joinButton = await page.$('button.Game_joinGameButton__a_XW1:has-text("Join")')
            const waitlistButton = await page.$('button.Game_joinGameButton__a_XW1:has-text("Join Waitlist")')

            if (joinButton) {
                await joinButton.click()
                console.log(`Attempting to join event at ${url}`)

                // Login process
                await page.fill('input[type=email]', LOGIN_EMAIL)
                await page.waitForLoadState('networkidle')
                await page.click('button:has-text("Continue with Email")');
                await page.fill('input[type=password]', LOGIN_PASSWORD)
                await page.waitForLoadState('networkidle')
                await page.click('button:has-text("Log in")');
                // Handle checkout
                await page.waitForLoadState('networkidle')
                
                await page.click('button:has-text("Next")');
                console.log("Clicked Next")

                // Wait for confirmation
                await page.waitForLoadState('networkidle')
                console.log("Checkout process completed")

            } else if (waitlistButton) {
                await waitlistButton.click()
                console.log(`Attempted to join waitlist for event at ${url}`)
            } else {
                console.log(`No join or waitlist button found for ${url}`)
            }

            break // If successful, break out of the retry loop
        } catch (e) {
            console.error(`Error processing ${url}:`, e)
            retries--
            if (retries > 0) {
                console.log(`Retrying... (${retries} attempts left)`)
                await page.waitForTimeout(5000) // Wait 5 seconds before retrying
            } else {
                console.error(`Failed to process ${url} after 3 attempts`)
            }
        }
    }
}

function loadNotifiedEvents() {
    try {
        if (fs.existsSync(NOTIFIED_EVENTS_FILE)) {
            return JSON.parse(fs.readFileSync(NOTIFIED_EVENTS_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('Error loading notified events:', error);
    }
    return {};
}

function saveNotifiedEvents(notifiedEvents) {
    fs.writeFileSync(NOTIFIED_EVENTS_FILE, JSON.stringify(notifiedEvents, null, 2));
}

async function sendNotification(newEvents) {
    let transporter = nodemailer.createTransport({
        service: 'gmail',  // Or your email service
        host: "smtp.gmail.com.",
        port: 587,
        secure: false,
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        }
    });

    let eventDetails = newEvents.map(event => 
        `Title: ${event.title}\nDate: ${event.date}\nLocation: ${event.location}\nLink: ${event.link}\n\n`
    ).join('');

    let mailOptions = {
        from: EMAIL_USER,
        to: NOTIFICATION_EMAIL,
        subject: 'New Matching Volleyball Events Found!',
        text: `The following new matching events were found:\n\n${eventDetails}`
    };

    try {
        let info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);
    } catch (error) {
        console.error('Error sending email:', error);
    }
}

(async () => {
    let notifiedEvents = loadNotifiedEvents();

    for (const browserType of ['chromium']) {
        const agent = random_useragent.getRandom();

        const browser = await playwright[browserType].launch({ headless: false });
        const context = await browser.newContext({ userAgent: agent });
        const page = await context.newPage({ bypassCSP: true });

        try {
            // Search by city
            await page.goto(BASE_URL);
            await page.fill('input[type="text"]', CITY);
            await page.waitForLoadState('networkidle');
            await page.click('li:has-text("Philadelphia")');

            // Wait for the event cards to load
            await page.waitForTimeout(2000);

            console.log('Waiting for event cards to load...');
            await page.waitForSelector('div[class*="EventCard_cardsContainer__"]', { timeout: 10000 });

            // Get data
            const event_Cards = await page.$$eval('div[class*="EventCard_container__"]', (cards) => {
                return cards.map((card) => {
                    const link = card.querySelector('a').href;
                    const title = card.querySelector('h2[class*="EventCard_event-title__"]')?.textContent.trim();
                    const date = card.querySelector('div[class*="EventCard_event-date__"]')?.textContent.trim();
                    const locationElement = card.querySelector('div[class*="EventCard_icon-list-item__"] p');
                    const location = locationElement ? locationElement.textContent.trim() : null;
                    const skillLevelElement = card.querySelectorAll('div[class*="EventCard_icon-list-item__"] p')[1];
                    const skillLevel = skillLevelElement ? skillLevelElement.textContent.trim() : null;
                    const feeElement = card.querySelector('div[class*="EventCard_icon-list-item__"]:last-child p');
                    const fee = feeElement ? feeElement.textContent.trim() : null;

                    return {
                        link,
                        title,
                        date,
                        location,
                        skillLevel,
                        fee
                    };
                });
            });

            // const event_urls = event_Cards
            // .filter(event => event.title.includes('SUN | ALL LEVELS'))
            // .filter(event => event.date.includes('Tue', 'Thu', 'Mon'))
            // .map(event => event.link)

            // console.log(`Found ${event_urls.length} matching events`)

            // Join events
            // if (event_urls.length !== 0) {
            //     for (const url of event_urls) {
            //         await joinEvent(page, url)
            //     }
            // }

            const matching_events = event_Cards.filter(event => event.title.includes('Co-Ed Volleyball 6 on 6*** BB Players***') || event.location.includes('Towey Playground'));

            console.log(`Found ${matching_events.length} matching events`);

            const newEvents = matching_events.filter(event => !notifiedEvents[event.link]);
            console.log(`New matching events: ${newEvents.length}`);

            const joinableEvents = [];
            for (const event of newEvents) {
                const canJoin = await checkJoinability(page, event);
                if (canJoin) {
                    // @ts-ignore
                    joinableEvents.push(event);
                }
            }

            console.log(`Joinable events: ${joinableEvents.length}`);

            if (joinableEvents.length > 0) {
                await sendNotification(joinableEvents);
                joinableEvents.forEach(event => {
                    // @ts-ignore
                    notifiedEvents[event.link] = true;
                });
                saveNotifiedEvents(notifiedEvents);
                console.log(`Sent notification for ${joinableEvents.length} new joinable events`);
            } else {
                console.log('No new joinable events found');
            }

            const logger = fs.createWriteStream('events.json', { flag: 'w' });
            logger.write(JSON.stringify(event_Cards, null, 2));
            console.log(`Extracted ${event_Cards.length} events. Data saved to events.json`);
        } catch (error) {
            console.error('An error occurred during the scraping process:', error);
        } finally {
            await browser.close();
        }
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});