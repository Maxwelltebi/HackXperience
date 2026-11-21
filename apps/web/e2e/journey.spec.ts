// The whole hackathon in one run (build plan Phase 7): apply → accept → confirm → go live →
// team up → submit → judge → award → publish results, by four people in four browsers.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { closeSql } from '@hx/db';
import { storageStatePath, type Role } from './env';
import {
  createJourneyEvent,
  deleteJourneyEvent,
  passSubmissionDeadline,
  teamId,
  type JourneyEvent,
} from './fixtures';

const TEAM = 'E2E Rockets';
const PROJECT = 'Water Map';

let event: JourneyEvent;

test.beforeAll(async () => {
  event = await createJourneyEvent();
});

test.afterAll(async () => {
  if (event && !process.env.E2E_KEEP_DATA) await deleteJourneyEvent(event.id);
  await closeSql();
});

/** A signed-in browser for one person. Confirmation dialogs are accepted, as a person would. */
async function signedIn(browser: Browser, role: Role): Promise<Page> {
  const context = await browser.newContext({ storageState: storageStatePath(role) });
  const page = await context.newPage();
  page.on('dialog', (dialog) => void dialog.accept());
  return page;
}

test('a hackathon from application to published results', async ({ browser }) => {
  const organizer = await signedIn(browser, 'organizer');
  const judge = await signedIn(browser, 'judge');
  const alice = await signedIn(browser, 'alice');
  const bob = await signedIn(browser, 'bob');
  const eventPage = `/events/${event.slug}`;
  const organize = `/organize/${event.id}`;

  await test.step('two participants apply', async () => {
    for (const page of [alice, bob]) {
      await page.goto(eventPage);
      await page.getByRole('link', { name: 'Apply now' }).click();
      await page.getByRole('button', { name: 'Submit application' }).click();
      await expect(page.getByRole('heading', { name: 'Your application' })).toBeVisible();
      await expect(page.getByText("We've got your application.")).toBeVisible();
    }
  });

  await test.step('the organizer accepts both', async () => {
    await organizer.goto(`${organize}/applications`);
    for (const name of ['E2E Alice', 'E2E Bob']) {
      await organizer.getByRole('button', { name: new RegExp(name) }).click();
      const panel = organizer.getByRole('complementary', { name: `Application from ${name}` });
      await panel.getByRole('button', { name: 'Accept', exact: true }).click();
      await expect(panel.getByRole('button', { name: 'Accept', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    }
  });

  await test.step('both confirm their place', async () => {
    for (const page of [alice, bob]) {
      await page.goto(eventPage);
      await page.getByRole('button', { name: 'Confirm my place' }).click();
      await expect(page.getByText("You're confirmed.")).toBeVisible();
    }
  });

  await test.step('the organizer starts the event', async () => {
    await organizer.goto(organize);
    await organizer.getByRole('button', { name: 'Go live' }).click();
    await expect(organizer.getByText('The event is running.')).toBeVisible();
  });

  await test.step('Alice starts a team and Bob joins with the invite code', async () => {
    await alice.goto(`${eventPage}/team`);
    await alice.getByLabel('Team name').fill(TEAM);
    await alice.getByRole('button', { name: 'Create team' }).click();
    const code = alice
      .getByText('Invite code', { exact: true })
      .locator('xpath=following-sibling::span[1]');
    await expect(code).toHaveText(/\S{4} \S{4}/);
    const inviteCode = (await code.textContent())?.replace(/\s/g, '') ?? '';

    await bob.goto(`${eventPage}/team`);
    await bob.getByLabel('Invite code').fill(inviteCode);
    await bob.getByRole('button', { name: 'Join team' }).click();
    await expect(bob.getByRole('heading', { name: TEAM, exact: true })).toBeVisible();
  });

  await test.step('Alice saves and submits the project', async () => {
    await alice.goto(`${eventPage}/submission`);
    await alice.getByLabel('Project title').fill(PROJECT);
    await alice.getByLabel('Tagline').fill('Where the clean water is, on one map.');
    await alice
      .getByRole('textbox', { name: 'Write-up' })
      .fill('We mapped every borehole in the district and **who maintains it**.');
    await alice.getByRole('button', { name: 'Save draft' }).click();
    await expect(alice.getByRole('button', { name: 'All changes saved' })).toBeVisible();
    await alice.getByRole('button', { name: 'Submit project' }).click();
    await expect(alice.getByText('Submitted. Edits you save are included.')).toBeVisible();
  });

  await test.step('the deadline passes and the organizer starts judging', async () => {
    await passSubmissionDeadline(event.id);
    await organizer.goto(organize);
    await organizer.getByRole('button', { name: 'Start judging' }).click();
    await expect(organizer.getByText('Judges are scoring projects.')).toBeVisible();

    await organizer.goto(`${organize}/judging`);
    await organizer.getByRole('button', { name: 'Assign judges' }).click();
    await expect(organizer.getByText('Assigned 1 judge across 1 project.')).toBeVisible();
  });

  await test.step('the judge scores the project', async () => {
    await judge.goto(`${organize}/judging`);
    await judge.getByRole('link', { name: new RegExp(PROJECT) }).click();
    await judge.getByLabel('Impact score').fill('8');
    await judge.getByLabel('Execution score').fill('7');
    await judge.getByLabel('Impact comment').fill('Clear problem, and the map is easy to use.');
    await judge.getByRole('button', { name: 'Save scores' }).click();
    await expect(judge.getByRole('button', { name: 'Update scores' })).toBeVisible();
  });

  await test.step('the organizer picks the winner and publishes results', async () => {
    await organizer.goto(`${organize}/judging`);
    await organizer
      .getByLabel(`Winners of ${event.awardName}`)
      .selectOption(await teamId(event.id, TEAM));
    await organizer.getByRole('button', { name: 'Save winners' }).click();
    await expect(organizer.locator('.chip', { hasText: TEAM })).toBeVisible();

    await organizer.goto(organize);
    await organizer.getByRole('button', { name: 'Mark completed' }).click();
    await expect(organizer.getByText('Results are final.')).toBeVisible();
  });

  await test.step('anyone can see the results and the gallery', async () => {
    const context = await browser.newContext();
    const visitor = await context.newPage();
    await visitor.goto(`${eventPage}/results`);
    const award = visitor.getByRole('region', { name: event.awardName });
    await expect(award).toContainText(PROJECT);
    await expect(award).toContainText(`${TEAM}: E2E Alice, E2E Bob`);
    await visitor.goto(`${eventPage}/gallery`);
    await expect(visitor.locator('body')).toContainText(PROJECT);
  });
});
