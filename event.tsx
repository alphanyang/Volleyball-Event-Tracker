const playwright = require('playwright')
const random_useragent = require("random-useragent")
const fs = require('fs')
const dotenv = require('dotenv')

dotenv.config()

const BASE_URL = 'https://opensports.net/discovery'
const CITY = 'Philadelphia, PA'

const userEmail = process.env.YOUR_EMAIL
const userPassword = process.env.YOUR_PASSWORD

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
                await page.fill('input[type=email]', userEmail)
                await page.waitForLoadState('networkidle')
                await page.click('button:has-text("Continue with Email")');
                await page.fill('input[type=password]', userPassword)
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

;(async () => {
  for (const browserType of ['chromium']) {
    const agent = random_useragent.getRandom()

    const browser = await playwright[browserType].launch({ headless: false})
    const context = await browser.newContext({ userAgent: agent })
    const page = await context.newPage({ bypassCSP: true })

    // Search by city
    await page.goto(BASE_URL)
    await page.fill('input[type="text"]', CITY)
    await page.waitForLoadState('networkidle');
    const philly = await page.$('li.rw-list-option:has-text("Philadelphia, PA")')
    await philly.click()

    // Wait for the event cards to load
    await page.waitForTimeout(2000)

    console.log('Waiting for event cards to load...');
    await page.waitForSelector('div[class*="EventCard_cardsContainer__"]', { timeout: 10000 })

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
            }
        });
    });

    const event_urls = event_Cards
        .filter(event => event.title.includes('SUN | ALL LEVELS'))
        .map(event => event.link)

    console.log(`Found ${event_urls.length} matching events`)

    if (event_urls.length !== 0) {
        for (const url of event_urls) {
            await joinEvent(page, url)
        }
    }

    const logger = fs.createWriteStream('events.json', { flag: 'w' })
    logger.write(JSON.stringify(event_Cards, null, 2))
    console.log(`Extracted ${event_Cards.length} events. Data saved to events.json`);
    await browser.close()
  }
})().catch((error) => {
    console.error(error)
    process.exit(1)
})