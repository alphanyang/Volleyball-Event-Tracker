const playwright = require('playwright')
const random_useragent = require("random-useragent")
const fs = require('fs')

const BASE_URL = 'https://opensports.net/discovery'
const CITY = 'Philadelphia, PA'

;(async () => {
  for (const browserType of ['chromium']) {
    const agent = random_useragent.getRandom()

    const browser = await playwright[browserType].launch({ headless: false })
    const context = await browser.newContext({ userAgent: agent })
    const page = await context.newPage({ bypassCSP: true })

    // Search by city
    await page.goto(BASE_URL)
    await page.fill('input[type="text"]', CITY)
    await page.waitForLoadState('networkidle');
    await page.keyboard.press('Enter')

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

    // Login
    // await page.goto('https://opensports.net/login')
    // await page.fill('input[name="email"]', 'paceholder@gmail.com')
    // await page.getByRole('button', { name: 'Continue with Email' }).click()
    // await page.fill('input[name="password"]', 'placeholder')
    // await page.getByRole('button', { name: 'Log in' }).click()

    const logger = fs.createWriteStream('events.json', { flag: 'w' })
    logger.write(JSON.stringify(event_Cards, null, 2))
    console.log(`Extracted ${event_Cards.length} events. Data saved to events.json`);
    console.log(agent);
    await browser.close()
  }
})().catch((error) => {
    console.error(error)
    process.exit(1)
})