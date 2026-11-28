const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const release = __dirname;
const previous = process.argv[2];
const stage = '/hr-fluent-staging/';
const prod = '/hr-fluent/';
const storageKey = 'hr-fluent-v5:staging';
const files = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};
let stagedBuild = previous || release;

async function workerInControl(page) {
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

async function navigate(page, tab) {
    await page.locator(`[data-nav="${tab}"]:visible`).first().click();
}

async function main() {
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const scope = [stage, prod].find(s => url.pathname.startsWith(s));
        const file = scope ? (url.pathname.slice(scope.length) || 'index.html') : '';
        if (!scope || !/^[\w.-]+$/u.test(file) || !files[path.extname(file)]) {
            res.writeHead(404).end();
            return;
        }
        try {
            const bytes = await fs.readFile(path.join(scope === stage ? stagedBuild : release, file));
            res.writeHead(200, { 'Content-Type': files[path.extname(file)], 'Cache-Control': 'no-store' }).end(bytes);
        } catch {
            res.writeHead(404).end();
        }
    });
    server.listen(0, 'localhost');
    await once(server, 'listening');

    let browser;
    try {
        const origin = `http://localhost:${server.address().port}`;
        const executablePath = process.env.HR_CHROMIUM_PATH || undefined;
        browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
        const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        const page = await context.newPage();
        page.setDefaultTimeout(12000);
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));

        if (previous) {
            await context.addInitScript(([key, scope]) => {
                if (location.pathname.startsWith(scope) && !localStorage.getItem(key)) {
                    localStorage.setItem(key, JSON.stringify({
                        words: { HR001: { seen: true, level: 3, favorite: true } },
                        days: {}, xp: 22, goal: 11, rate: 1,
                        phrases: ['HR001'], sentences: ['HR001~ext', 'HR019~extra', 'HR110~extra']
                    }));
                }
            }, [storageKey, stage]);
            await page.goto(origin + stage);
            await page.waitForFunction(() => typeof DB !== 'undefined' && DB.version === '18.1.1');
            await workerInControl(page);
            const oldBookmarks = await page.evaluate(() => ['HR001~ext', 'HR019~extra', 'HR110~extra'].map(id => byId(id).example));
            stagedBuild = release;
            await page.evaluate(() => window.hrFluentCheckVersion(true));
            await page.waitForFunction(() => typeof DB !== 'undefined' && DB.version === '18.2.0');
            await workerInControl(page);
            await page.waitForFunction(async () => {
                const keys = (await caches.keys()).filter(key => key.startsWith('hrf-scope:%2Fhr-fluent-staging%2F:'));
                return keys.length === 1 && keys[0].includes('hr-fluent-v18-2-0-release-');
            });
            const state = await page.evaluate(() => ({
                bookmarks: ['HR001~ext', 'HR019~extra', 'HR110~extra'].map(id => byId(id).example),
                storage: JSON.parse(localStorage.getItem(KEY))
            }));
            assert.deepEqual(state.bookmarks, oldBookmarks);
            assert.equal(state.storage.goal, 11);
            assert.equal(state.storage.xp, 22);
            assert.equal(state.storage.words.HR001.favorite, true);
            assert.deepEqual(state.storage.phrases, ['HR001']);
            assert.deepEqual(state.storage.sentences, ['HR001~ext', 'HR019~extra', 'HR110~extra']);
            console.log('PASS V18.1.9 -> V18.2.0 update with controlled old service worker and preserved progress/bookmarks');
        } else {
            await page.goto(origin + stage);
            await workerInControl(page);
        }

        await navigate(page, 'words');
        await page.locator('#wordSearch').fill('Job requisition');
        await page.locator('[data-detail="HR001"]:visible').first().click();
        const detail = page.getByRole('dialog', { name: /详情/u });
        await detail.getByRole('heading', { name: '职场例句' }).waitFor();
        await detail.locator('[data-detail-tab="dialogue"]').click();
        await detail.locator('.dialogue-role').first().waitFor();
        assert.ok(await detail.locator('.dialogue-role').count() >= 2);
        await detail.locator('[data-action^="bookToggle:sentences:"]').first().click();
        await detail.locator('[data-detail-tab="expand"]').click();
        await detail.getByRole('heading', { name: '独立职场短句' }).waitFor();
        const extension = await detail.locator('.detail-content-unit').last().locator('.example-en').innerText();
        await detail.locator('[data-action^="bookToggle:sentences:"]').click();
        await detail.locator('[data-detail-tab="compare"]').click();
        await detail.locator('.distinguish-note').first().waitFor();
        await detail.locator('[data-detail-tab="practice"]').click();
        await detail.locator('[data-detail-answer="HR001"]').click();
        await detail.getByText('回答正确！').waitFor();
        await detail.locator('[data-action="closeDetail"]').click();
        await navigate(page, 'me');
        assert.doesNotMatch(await page.locator('#root').innerText(), /V18\.0 DEV/u);
        await page.locator('[data-action="book:sentences"]').click();
        await page.getByText(extension, { exact: true }).waitFor();
        await page.getByText(extension, { exact: true }).locator('..').getByRole('button', { name: '原词条' }).click();
        await detail.waitFor();
        await detail.locator('[data-action="closeDetail"]').click();
        await navigate(page, 'study');
        await page.locator('.tapcard').click();
        await page.locator('[data-rate="1"]').click();
        assert.ok(await page.evaluate(() => Object.values(STORE.words).some(word => word.lastDay === today())));
        await navigate(page, 'scene');
        await page.locator('[data-scene="S05"]').click();
        await page.getByText(/documented evidence against/u).waitFor();
        await page.locator('[data-action="sceneAnswer"]').click();
        await page.locator('.quote strong').filter({ hasText: 'documented evidence' }).waitFor();
        await navigate(page, 'oral');
        await page.getByRole('heading', { name: '高频职场口语' }).waitFor();
        console.log('PASS mobile viewport search, all five word tabs, sentence collection and lookup, rating, scene and oral navigation');

        const desktop = await context.newPage();
        desktop.on('pageerror', error => pageErrors.push(error.message));
        await desktop.setViewportSize({ width: 1366, height: 850 });
        await desktop.goto(origin + prod);
        await workerInControl(desktop);
        assert.equal(await desktop.evaluate(() => KEY), 'hr-fluent-v5');
        assert.equal(await desktop.evaluate(() => Boolean(STORE.words.HR001?.favorite)), false);
        await navigate(desktop, 'words');
        await desktop.locator('#wordSearch').fill('计');
        await desktop.locator('#wordResults [data-detail]').first().waitFor();
        assert.equal(await desktop.evaluate(() => DB.words.length), 650);
        await context.setOffline(true);
        await desktop.goto(origin + prod);
        await desktop.waitForFunction(() => typeof DB !== 'undefined' && DB.version === '18.2.0');
        await workerInControl(page);
        await page.goto(origin + stage);
        await page.waitForFunction(() => typeof DB !== 'undefined' && DB.version === '18.2.0');
        console.log('PASS desktop search, production/staging storage isolation and offline navigation on both scopes');

        const noScript = await browser.newContext({ javaScriptEnabled: false });
        const fallback = await noScript.newPage();
        await fallback.goto(origin + prod);
        assert.equal(await fallback.locator('.static-fallback details').count(), 650);
        const firstWord = fallback.locator('.static-fallback details').filter({ hasText: 'Job requisition' }).first();
        await firstWord.locator('summary').click();
        assert.equal(await fallback.locator('.static-fallback details[open]').count(), 1);
        const currentExample = await desktop.evaluate(() => DB.words.find(word => word.id === 'HR001').example);
        assert.equal(await firstWord.locator('p[lang="en"]').innerText(), currentExample);
        await noScript.close();
        assert.deepEqual(pageErrors, []);
        console.log('PASS script-disabled 650-entry fallback and zero page errors');
    } finally {
        try {
            if (browser) await browser.close();
        } finally {
            server.close();
        }
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
