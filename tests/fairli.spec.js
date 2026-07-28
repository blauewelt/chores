// Fairli Tier-1 regression tests.
// Every test here corresponds to a bug that actually shipped once.
// Supabase is fully mocked — tests never touch production data.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __i18nDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n');

const FAM = 'testfam-abc123';
// Live-App-Version aus index.html — Tests duerfen NIE eine Versionsnummer
// hartkodieren (v4.61.1: '4.61.0' im Selbstheilungs-Test brach beim Patch-Bump)
const APP_VERSION = /APP_VERSION = '([^']+)'/.exec(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8'))[1];
const BASE = '/chores';
const SB = 'https://uggipomhmnnmiqpbpxcc.supabase.co';

const MEMBERS = [
  { id: 'm-chris', name: 'Timon', color: '#2FAE6A', family_id: FAM, url_slug: 'slugchris1' },
  { id: 'm-mira',  name: 'Mira',  color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1' },
];
const CHORES = [{ id: 'c-1', name: 'Müll rausbringen', points: 2, note: 'nur Restmüll', family_id: FAM }];
const LOG = [{ id: 'l-1', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: 'nur Restmüll',
  member_id: 'm-mira', member_name: 'Mira', points: 2, done_at: '2026-07-10T10:00:00Z', family_id: FAM }];
const FAMILIES = [{ family_id: FAM, name: 'Testhaushalt' }];

// Mock all Supabase REST + block third-party fetches (fonts, tile art).

// v4.71.1: Zeitstempel «vor N ms, aber GARANTIERT in dieser Woche».
// Fixtures, die «vor 40 Stunden» seeden und dann eine WOCHEN-Summe pruefen,
// sind Zeitbomben: montags frueh liegt der grosse Teil davon vor weekStart()
// (Montag 00:00), die Summe faellt, der Test wird rot — an einem Wochentag,
// nicht an einem Commit. Genau so ist v4.65.0 an einem Montag um 06:14 UTC
// gefallen, gruen an allen anderen Tagen. Deshalb an die Wochengrenze
// klemmen: ausserhalb des Randfalls aendert das nichts.
function weekSafeAgo(ms) {
  const w = new Date(); w.setHours(0, 0, 0, 0);
  w.setDate(w.getDate() - ((w.getDay() + 6) % 7));        // Montag, wie weekStart()
  return new Date(Math.max(w.getTime() + 1000, Date.now() - ms)).toISOString();
}

// v4.82.0: den eigenen Zeit-Picker bedienen — Feld-Knopf oeffnet das Sheet,
// Zieltag antippen (bei Bedarf einen Monat zurueckblaettern: das 42er-Raster
// zeigt Nachbarmonats-Tage, aber nicht beliebig weit), Stunde/Minute waehlen,
// Uebernehmen. Erst DANACH ist der Wert im Feld — × und Backdrop verwerfen.
async function setPickerTime(page, day /* 'YYYY-MM-DD' */, h, m) {
  await page.locator('#lTime').click();
  await expect(page.locator('#timeSheet')).toBeVisible();
  const cell = page.locator(`#timeSheet .day[data-day="${day}"]`);
  if (!(await cell.count())) await page.locator('#tpPrev').click();
  await page.locator(`#timeSheet .day[data-day="${day}"]`).click();
  await page.locator('#tpH').selectOption(String(h));
  await page.locator('#tpM').selectOption(String(m));
  await page.locator('#tpApply').click();
  await expect(page.locator('#timeSheet')).toBeHidden();
}

// v4.69.0: Pro-Person-Sheet oeffnen — synthetischer Klick (kein Koordinaten-
// Klick, der nach dem showModal in den Backdrop-Close der neuen dialog
// bubbeln koennte), danach Sichtbarkeit zusichern.
async function openPerson(page, mid) {
  await page.evaluate(id => document.querySelector(`.prow[data-pid="${id}"]`).click(), mid);
  await expect(page.locator('#personSheet')).toBeVisible();
}
// Externe Hosts hart abbrechen. Pflicht in JEDEM Test — auch in denen mit
// eigenem Routing (stehende Regel, §10). Hintergrund v4.70.0: in Sandboxen
// mit Egress-Proxy ANTWORTET ein Font-Request nicht, er HAENGT — dann feuert
// das load-Event nie und waitForURL laeuft ins Timeout. Zwei Ersteinrichtungs-
// Tests hatten die Aborts nicht und waren genau dort unreproduzierbar rot.
async function blockExternal(context) {
  await context.route('**://fonts.googleapis.com/**', r => r.abort());
  await context.route('**://fonts.gstatic.com/**', r => r.abort());
  await context.route('**://gen.pollinations.ai/**', r => r.abort());
}
async function mockBackend(context, { logRows = () => LOG, memberRows = null, famRows = null } = {}) {
  // Standard-Persona: WIEDERKEHRER — das Onboarding «Zugriff sichern»
  // (v4.45.0, modal!) gilt als gesehen, sonst blockierte es jeden Test.
  // Onboarding-Tests entfernen die Marke gezielt.
  await context.addInitScript(fam => {
    try {
      if (!sessionStorage.getItem('fairli.obPersona.off')) {
        localStorage.setItem('haushalt.onboard:' + fam + ':a', '1');
        localStorage.setItem('haushalt.onboard:' + fam + ':u', '1');
      }
      // v4.61.0: Identitäts-Angebot (v4.60.0) gilt als gesehen — es fehlte in
      // DIESEM Standard-Persona (nur suppressOnboarding hatte die Marke) und
      // blockierte als modales Sheet 18 Bestandstests. Claim-Tests schalten
      // die Marke gezielt ab.
      if (!sessionStorage.getItem('fairli.claimPersona.off')) {
        localStorage.setItem('haushalt.claim:' + fam, '1');
      }
    } catch {}
  }, FAM);
  await blockExternal(context);
  await context.route(`${SB}/rest/v1/**`, route => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== 'GET') {
      return route.fulfill({ status: 204, body: '' });
    }
    // Realismus: Supabase filtert nach family_id — Anfragen fuer fremde
    // (z. B. famc-Hash-Probe) muessen LEER sein, sonst glaubt der Client,
    // die Familie sei bereits verschluesselt.
    const famEq = (new URL(url).searchParams.get('family_id') || '').replace('eq.', '');
    if (famEq && famEq !== FAM) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    // v4.65.0: log_totals VOR /log pruefen (Praefix-Falle) — die Sicht
    // liefert Server-Summen ueber ALLE Zeilen; im Mock aus logRows berechnet,
    // damit Bestandstests ihre Punktzahlen behalten.
    // v4.69.4: der Mock respektiert select= — vorher lieferte er IMMER alle
    // Felder und maskierte damit exakt den Live-Fehler «goal fehlt in der
    // Pull-Spaltenliste» (20+ gruene Ziel-Tests, waehrend die echte App die
    // Spalte verwarf). Projektion wie PostgREST: nur gelistete Spalten.
    const project = rows => {
      const sel = (url.match(/select=([^&]+)/) || [])[1];
      if (!sel || decodeURIComponent(sel).trim() === '*' || !Array.isArray(rows)) return rows;
      const cols = decodeURIComponent(sel).split(',').map(c => c.trim()).filter(c => /^[a-z_]+$/.test(c));
      if (!cols.length) return rows;
      return rows.map(r => Object.fromEntries(cols.filter(c => c in r).map(c => [c, r[c]])));
    };
    const body =
      url.includes('/rest/v1/log_weekly') ? (() => {
        // Wochen-Summen wie die Server-Sicht, aus logRows gerechnet (Schluessel
        // = LOKALER Montag, wie der Client sie baut)
        const agg = {};
        const pad = x => String(x).padStart(2, '0');
        for (const e of logRows()) {
          if (e.deleted_at) continue;
          const d = new Date(e.done_at); d.setHours(0, 0, 0, 0);
          d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
          const wk = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
          const k = e.member_id + '|' + wk;
          const a = agg[k] || (agg[k] = { member_id: e.member_id, week_start: wk, pts: 0, n: 0 });
          a.pts += e.points; a.n++;
        }
        let rows = Object.values(agg);
        const mm = url.match(/member_id=eq\.([^&]+)/);
        if (mm) rows = rows.filter(r => r.member_id === decodeURIComponent(mm[1]));
        return rows.sort((a, b) => (a.week_start < b.week_start ? 1 : -1));
      })() :
      url.includes('/rest/v1/log_totals') ? (() => {
        const agg = {};
        for (const e of logRows()) {
          if (e.deleted_at) continue;
          const a = agg[e.member_id] || (agg[e.member_id] = { member_id: e.member_id, pts: 0, n: 0, first_done: null });
          if (!a.first_done || e.done_at < a.first_done) a.first_done = e.done_at;
          a.pts += e.points || 0; a.n++;
        }
        return Object.values(agg);
      })() :
      url.includes('/rest/v1/members') ? (memberRows ? memberRows() : MEMBERS) :
      url.includes('/rest/v1/chores')  ? CHORES :
      url.includes('/rest/v1/log')     ? logRows() :
      url.includes('/rest/v1/families') ? (famRows ? famRows() : FAMILIES) : [];
    const projected = (url.includes('/rest/v1/members') || url.includes('/rest/v1/chores')) ? project(body) : body;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(projected) });
  });
}

// Onboarding-Persona auch fuer Tests mit EIGENEN Routen (ohne mockBackend):
// sonst blockiert das «Zugriff sichern»-Modal (v4.45.0) jeden Klick.
async function suppressOnboarding(context) {
  await context.addInitScript(fam => {
    try {
      localStorage.setItem('haushalt.onboard:' + fam + ':a', '1');
      localStorage.setItem('haushalt.onboard:' + fam + ':u', '1');
      localStorage.setItem('haushalt.claim:' + fam, '1');   // v4.60.0: Identitäts-Angebot in Tests stumm
    } catch {}
  }, FAM);
}

test.describe('Fairli', () => {

  test('persönlicher Link: verriegelte Sicht, keine Admin-Buttons (Bug v4.13.1/v4.13.2)', async ({ context, page }) => {
    await mockBackend(context, { logRows: () => LOG });
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    // 404-Handoff → App; URL kanonisiert auf den Pfad
    await expect(page).toHaveURL(new RegExp(`${BASE}/f/${FAM}/u/slugmira1$`));
    // Flicker-Schutz: userlink-Klasse ist gesetzt, Admin-Buttons per CSS weg
    await expect(page.locator('html')).toHaveClass(/userlink/);
    await expect(page.locator('#openMembers')).toBeHidden();
    // ICH BIN auf Mira verriegelt, Timon-Chip existiert nicht
    await expect(page.locator('.chip', { hasText: 'Mira' })).toBeVisible();
    await expect(page.locator('.chip', { hasText: 'Timon' })).toHaveCount(0);
    // Teilen ist fuer Mitglieder sichtbar (v4.15.0)
    await expect(page.locator('#openShareTop')).toBeVisible();
  });

  test('Mitglieder-Teilen: alle persönlichen Links, KEIN Familien-Link (ein Mitglied-Bug v4.19.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    await page.locator('#openShareTop').click();
    const sheet = page.locator('#shareSheet');
    await expect(sheet.locator('.shname', { hasText: 'Mira' })).toBeVisible();
    await expect(sheet.locator('.shname', { hasText: 'Timon' })).toBeVisible();     // einander einladen können
    await expect(sheet.locator('.shname', { hasText: 'Ganze Familie' })).toHaveCount(0); // Admin-Link verborgen
    await expect(sheet.locator('.shname', { hasText: 'weiterempfehlen' })).toBeVisible();
    await expect(sheet.getByText('NEUEN, leeren Haushalt')).toBeVisible();          // Warnung am App-Link
  });

  test('Einladen-Sheet (v4.55.0): kein separater Familien-Link mehr — Admins sind gekennzeichnet, Hinweis nennt sie', async ({ context, page }) => {
    await mockBackend(context, { memberRows: () => [
      { id: 'm-chris', name: 'Timon', color: '#2FAE6A', family_id: FAM, url_slug: 'slugchris1', admin: true },
      { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', admin: false },
    ] });
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('html')).not.toHaveClass(/userlink/);   // blanker Link bleibt Admin
    await expect(page.locator('#openMembers')).toBeVisible();
    await page.locator('#openShareTop').click();
    const sheet = page.locator('#shareSheet');
    // Der separate Admin-Link-Block ist ersatzlos weg
    await expect(sheet.locator('.shfam')).toHaveCount(0);
    await expect(sheet.locator('.shname', { hasText: 'Admin-Link' })).toHaveCount(0);
    // Stattdessen: Admin am Namen erkennbar + Hinweis, mindestens einen zu sichern
    await expect(sheet.locator('.shrow', { hasText: 'Timon' }).locator('.shname')).toContainText('🔑');
    await expect(sheet.locator('.shrow', { hasText: 'Mira' }).locator('.shname')).not.toContainText('🔑');
    await expect(sheet.locator('.savenote')).toContainText('Admin: Timon');
    await expect(sheet.locator('.savenote')).toContainText('Lesezeichen');
    await expect(sheet.locator('.subnote', { hasText: 'Verschick sie an deine Mitbewohner oder Familie' })).toBeVisible();
    // QR-Bildunterschriften unverändert (v4.19.0)
    await sheet.locator('.shrow', { hasText: 'Mira' }).locator('.qrtog').click();
    await expect(sheet.getByText('Persönlicher Link für Mira')).toBeVisible();
  });

  test('Handoff überlebt komplett gestrippte Query (v4.19.1)', async ({ context, page }) => {
    await mockBackend(context);
    // Simuliert: 404.html hat gestasht, aber ?r wurde unterwegs entfernt
    await page.addInitScript(([fam]) => {
      try { sessionStorage.setItem('fairli.handoff', `f/${fam}/u/slugmira1`); } catch {}
    }, [FAM]);
    await page.goto(`${BASE}/index.html`);
    await expect(page).toHaveURL(new RegExp(`${BASE}/f/${FAM}/u/slugmira1$`));
    await expect(page.locator('html')).toHaveClass(/userlink/);
  });

  test('blanke URL ohne Vorgeschichte: Einstiegsseite mit Diagnose (Amelie-Diagnose v4.19.1)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/`);
    await expect(page.getByRole('button', { name: 'Neuen Haushalt erstellen' })).toBeVisible();
    // v4.58.0: im Browser ist die Diagnose eingeklappt (Haustuer, kein
    // Debug-Anblick) — ein Tipp auf ⓘ öffnet sie für den Support-Fall
    await expect(page.getByText('Geöffnet:')).toBeHidden();
    await page.locator('summary', { hasText: 'Diagnose' }).click();
    await expect(page.getByText('Geöffnet:')).toBeVisible();
    await expect(page.getByText('Modus: browser')).toBeVisible();   // Icon-Start wuerde «standalone» zeigen
  });

  test('Identität leckt nicht vom persönlichen Link in die Admin-Sicht (Bug v4.18.1)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    await expect(page.locator('html')).toHaveClass(/userlink/);
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('html')).not.toHaveClass(/userlink/);
    const adminMe = await page.evaluate(fam => localStorage.getItem('haushalt.me:' + fam + ':admin'), FAM);
    expect(adminMe).toBeNull();   // der Besuch der zweiten Person hat die Admin-Identitaet NICHT gesetzt
  });

  test('Verlauf: Löschen bleibt gelöscht, auch wenn ein Pull die Zeile zurückbringt (Bug v4.17.0)', async ({ context, page }) => {
    // Modelliert die ECHTE Race aus v4.17.0: ein Pull startet, waehrend das
    // DELETE noch unterwegs ist, und seine Antwort enthaelt die Zeile noch.
    // (Ein Pull, der NACH bestaetigtem DELETE startet, darf dem Server
    // vertrauen — das ist die Selbstaufraeum-Regel der Reconciliation und
    // absichtlich NICHT Gegenstand dieses Tests.)
    await mockBackend(context);   // GET /log liefert die Zeile weiterhin
    await context.route(`${SB}/rest/v1/log**`, async route => {
      if (route.request().method() === 'DELETE') {
        await new Promise(r => setTimeout(r, 500));   // DELETE haengt 500 ms
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();    // GETs an mockBackend durchreichen
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    const entry = page.locator('.entry', { hasText: 'Müll rausbringen' });
    await expect(entry).toBeVisible();
    await entry.click();
    await page.locator('#logSheet #delLog').click();
    await expect(entry).toHaveCount(0);               // optimistisch sofort weg
    // Pull startet SOFORT — DELETE ist noch nicht bestaetigt (Race!)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(800);                   // Pull-Antwort + DELETE-Commit abwarten
    await expect(page.locator('.entry', { hasText: 'Müll rausbringen' })).toHaveCount(0);
  });

  test('404-Redirect trägt alle drei Kanäle: ?r, sessionStorage, Hash (Noel-Retest v4.19.2)', async ({ context, page }) => {
    await mockBackend(context);
    const seen = [];
    page.on('framenavigated', f => seen.push(f.url()));
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    // Das Zwischenziel des 404-Handoffs muss Query UND Hash tragen
    expect(seen.some(u => /index\.html\?r=.*#f\//.test(u))).toBe(true);
    await expect(page.locator('html')).toHaveClass(/userlink/);
  });

  test('Hash allein rettet die Route (Query + sessionStorage weg — Live-Befund Kind-Telefon)', async ({ context, page }) => {
    await mockBackend(context);
    // Exakt der beobachtete Zustand: index.html ohne ?r, ohne Handoff —
    // aber MIT Hash (Kanal 3). Muss in der verriegelten Sicht landen.
    await page.goto(`${BASE}/index.html#f/${FAM}/u/slugmira1`);
    await expect(page).toHaveURL(new RegExp(`${BASE}/f/${FAM}/u/slugmira1$`));
    await expect(page.locator('html')).toHaveClass(/userlink/);
    await expect(page.locator('.chip', { hasText: 'Mira' })).toBeVisible();
  });

  test('Stale-Icon-Falle: standalone + blanke index.html → Diagnose benennt das Icon (Noel, v4.19.3)', async ({ context, page }) => {
    await mockBackend(context);
    // navigator.standalone = das iOS-Signal, das die Diagnose prueft
    // (CDP-display-mode-Emulation greift im Headless-Shell nicht — gelernt)
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
    // Frisches Geraet, Icon mit eingebackener index.html — exakt der Kind-Telefon-Zustand
    await page.goto(`${BASE}/index.html`);
    // v4.19.4: veraltetes Icon wird BENANNT, Haushalt-Erstellen ist demontiert,
    // der Einladungs-Link ist die Primaeraktion
    await expect(page.getByText('Veraltetes Fairli-Icon')).toBeVisible();
    await expect(page.getByText('Modus: standalone (Homescreen-Icon!)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ich habe einen Einladungs-Link' })).toBeVisible();
  });

  test('Gesundes Admin-Icon: standalone + gespeicherte Familien-Route → Familien-Sicht (v4.14.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
    await page.addInitScript(([fam]) => {
      try { localStorage.setItem('haushalt.route.family', JSON.stringify({ family: fam, userSlug: null })); } catch {}
    }, [FAM]);
    // Installierte Familien-App startet an der generischen start_url — Restore muss greifen
    await page.goto(`${BASE}/index.html`);
    await expect(page).toHaveURL(new RegExp(`${BASE}/f/${FAM}$`));
    await expect(page.locator('#openMembers')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Neuen Haushalt erstellen' })).toHaveCount(0);
  });

  test('Manifest-Regel: nie auf iOS, seit v4.56.0 aber sehr wohl auf persönlichen Links (Android/Desktop)', async ({ context, page, browserName }) => {
    await mockBackend(context);
    // Familien-Kontext
    await page.goto(`${BASE}/f/${FAM}`);
    const famCount = await page.locator('link[rel="manifest"]').count();
    if (browserName === 'webkit') expect(famCount).toBe(0);   // iOS-Profil: NIE (Parse-Zeit-Falle!)
    else expect(famCount).toBe(1);                            // Android: injiziert
    // Persönlicher Link: iOS weiterhin manifest-frei, Android/Desktop MIT
    // eigenem Manifest — ohne das bot Chrome nur eine Verknüpfung an
    // (Maintainer-Befund 20.07.2026), keine echte App.
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    const userCount = await page.locator('link[rel="manifest"]').count();
    if (browserName === 'webkit') expect(userCount).toBe(0);
    else expect(userCount).toBe(1);
  });

  test('Install-Banner: sichtbar für Link-Empfänger, öffnet Anleitung, Dismiss persistiert (v4.22.0)', async ({ context, page, browserName }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);          // genau der Empfänger-Fall
    const bar = page.locator('#installBar');
    await expect(bar).toBeVisible();
    await page.locator('#installBarOpen').click();
    const sheet = page.locator('#installSheet');
    await expect(sheet.getByRole('heading', { name: 'Als App installieren' })).toBeVisible();
    // v4.23.0: nur die EIGENE Plattform — fremde Anleitungen verwirren
    if (browserName === 'webkit') {
      await expect(sheet.getByText('Zum Home-Bildschirm')).toBeVisible();
      await expect(sheet.getByText('Zum Startbildschirm hinzufügen')).toHaveCount(0);
    } else {
      await expect(sheet.getByText('Zum Startbildschirm hinzufügen')).toBeVisible();
      await expect(sheet.getByText('iPhone')).toHaveCount(0);
    }
    await sheet.locator('#closeInstall').click();
    await page.locator('#installBarClose').click();
    await expect(bar).toBeHidden();
    await page.reload();
    await expect(page.locator('#installBar')).toBeHidden();   // Dismiss überlebt Reload
  });

  test('Install-Banner: nie im Standalone-Modus (v4.22.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('#openMembers')).toBeVisible(); // App geladen
    await expect(page.locator('#installBar')).toBeHidden();   // aber kein Banner
  });

  test('Verlauf: Serien gebündelt (×N, Summenpunkte), Serie löschbar (v4.23.0)', async ({ context, page }) => {
    const serie = [1,2,3].map(i => ({ id: 'l-s'+i, chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: 'nur Restmüll',
      member_id: 'm-mira', member_name: 'Mira', points: 2, done_at: `2026-07-10T10:0${4-i}:00Z`, family_id: FAM }));
    const timonRow = { id: 'l-c', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: null,
      member_id: 'm-chris', member_name: 'Timon', points: 2, done_at: '2026-07-10T09:00:00Z', family_id: FAM };
    await mockBackend(context, { logRows: () => [...serie, timonRow] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry')).toHaveCount(2);            // Miras Serie + Timon
    const g = page.locator('.entry', { hasText: 'Mira' });
    await expect(g.locator('.xn')).toHaveText('×3');
    await expect(g.locator('.pts')).toHaveText('+6');               // Summe statt Einzelpunkte
    await g.click();                                             // ganze Zeile öffnet das Sheet (v4.31)
    const del = page.locator('#logSheet #delLog');
    await expect(del).toHaveText('Löschen (3)');
    await del.click();
    await expect(page.locator('.entry')).toHaveCount(1);            // ganze Serie weg
  });

  test('Verlauf: Eintrag bearbeiten — Titel + Notiz, Serie gemeinsam (v4.23.0)', async ({ context, page }) => {
    let patches = 0;
    await mockBackend(context);
    await context.route(`${SB}/rest/v1/log**`, r =>
      r.request().method() === 'POST' ? (patches++, r.fulfill({ status: 201, body: '' })) : r.fallback());   // seit v4.47.5 upsertRemote → POST
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await page.locator('.entry').first().click();               // Zeile öffnet Sheet direkt (v4.31)
    const sh = page.locator('#logSheet');
    await expect(sh.getByRole('heading', { name: 'Eintrag bearbeiten' })).toBeVisible();
    await sh.locator('#lName').fill('Müll & Papier');
    await sh.locator('#lNote').fill('auch Karton');
    await sh.locator('#saveLog').click();
    await expect(page.locator('.entry', { hasText: 'Müll & Papier' })).toBeVisible();
    await expect(page.locator('.entry .enote', { hasText: 'auch Karton' })).toBeVisible();
    expect(patches).toBeGreaterThan(0);                             // Upsert ging raus
  });

  test('Einmalig: Kachel immer vorn, verbucht ohne neue Kachel (v4.23.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('.grid .chore').first()).toHaveId('oneOffTile');   // oben links verankert
    await page.locator('.chip', { hasText: 'Timon' }).click();
    const tiles = await page.locator('.grid .chore').count();
    await page.locator('#oneOffTile').click();
    await expect(page.getByRole('heading', { name: 'Einmalig eintragen' })).toBeVisible();
    await page.locator('#cName').fill('Blumen giessen');
    await page.locator('#saveChore').click();   // #oneOffTile matcht «Eintragen» auch — Id ist eindeutig
    await expect(page.locator('.grid .chore')).toHaveCount(tiles);               // KEINE neue Kachel
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry', { hasText: 'Blumen giessen' })).toBeVisible();
  });

  test('Neue Aufgabe: Primär = «Speichern + eintragen», Ghost = «Nur speichern» (v4.23.1)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('.chip', { hasText: 'Timon' }).click();
    // Primaerweg: legt Kachel an UND verbucht
    await page.locator('#openAdd').click();
    await expect(page.locator('#saveChore')).toHaveText('Speichern + eintragen');
    await expect(page.locator('#saveAndRecord')).toHaveText('Nur speichern');
    await page.locator('#cName').fill('Fenster putzen');
    await page.locator('#saveChore').click();
    await expect(page.locator('.chore', { hasText: 'Fenster putzen' })).toBeVisible();
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry', { hasText: 'Fenster putzen' })).toBeVisible();
    // Ghostweg: NUR Kachel, keine Buchung
    await page.getByRole('tab', { name: 'Aufgaben' }).click();
    await page.locator('#openAdd').click();
    await page.locator('#cName').fill('Keller fegen');
    await page.locator('#saveAndRecord').click();
    await expect(page.locator('.chore', { hasText: 'Keller fegen' })).toBeVisible();
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry', { hasText: 'Keller fegen' })).toHaveCount(0);
    // Bearbeiten-Modus: nur «Speichern», kein Ghost
    await page.getByRole('tab', { name: 'Aufgaben' }).click();
    await page.locator('.chore', { hasText: 'Keller fegen' }).locator('[data-edit]').click();
    await expect(page.locator('#saveChore')).toHaveText('Speichern');
    await expect(page.locator('#saveAndRecord')).toBeHidden();
  });

  test('Verlauf-Löschen: Undo stellt wieder her, Commit erst nach dem Fenster — als GRABSTEIN, nie DELETE (v4.24.0/v4.63.0)', async ({ context, page }) => {
    test.setTimeout(30000);   // enthaelt bewusst das volle 5s-Undo-Fenster
    let deletes = 0, tombstones = 0;
    await mockBackend(context);
    await context.route(`${SB}/rest/v1/log**`, r => {
      const req = r.request();
      if (req.method() === 'DELETE') { deletes++; return r.fulfill({ status: 204, body: '' }); }
      if (req.method() === 'POST') {
        const rows = JSON.parse(req.postData() || '[]');
        if ((Array.isArray(rows) ? rows : [rows]).some(x => x.deleted_at)) tombstones++;
        return r.fulfill({ status: 204, body: '' });
      }
      return r.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    const entry = page.locator('.entry', { hasText: 'Müll rausbringen' });
    await entry.click();
    await page.locator('#logSheet #delLog').click();
    await expect(page.locator('.entry')).toHaveCount(0);            // lokal sofort weg
    // Undo im Fenster: rein lokal, NICHTS ging raus
    await page.locator('#toast .tact', { hasText: 'Rückgängig' }).click();
    await expect(page.locator('.entry', { hasText: 'Müll rausbringen' })).toHaveCount(1);
    expect(deletes).toBe(0);
    expect(tombstones).toBe(0);
    // Pull darf die wiederhergestellte Zeile nicht fressen (pendingDeletes bereinigt)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(400);
    await expect(page.locator('.entry', { hasText: 'Müll rausbringen' })).toHaveCount(1);
    // Zweiter Löschvorgang, KEIN Undo → GRABSTEIN nach Ablauf des Fensters
    await entry.click();
    await page.locator('#logSheet #delLog').click();
    await expect(page.locator('.entry')).toHaveCount(0);
    expect(tombstones).toBe(0);                                     // noch im Fenster
    await page.waitForTimeout(5300);
    expect(tombstones).toBeGreaterThan(0);                          // jetzt committet
    expect(deletes).toBe(0);                                        // v4.63.0: NIE als DELETE
  });

  test('Kachel-Kunst: Prompt zeigt das genannte Ding, nicht «household chore» (v4.26.0)', async ({ context, page }) => {
    await mockBackend(context);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await context.route('**://gen.pollinations.ai/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
    await page.goto(`${BASE}/f/${FAM}`);
    // Einmalig-Kachel: expliziter Stern-Prompt, kein «household chore»-Framing
    const star = page.locator('#oneOffTile img.art');
    await expect(star).toBeVisible();
    const starSrc = decodeURIComponent(await star.getAttribute('src'));
    expect(starSrc).toContain('shooting star');
    expect(starSrc).not.toContain('household chore');
    // Reguläre Kachel: Name steht drin, KEIN erzwungenes «household chore»
    const cSrc = decodeURIComponent(await page.locator('.chore[data-cid="c-1"] img.art').getAttribute('src'));
    expect(cSrc).toContain('Müll rausbringen');
    expect(cSrc).not.toContain('household chore');
    // Seed ist numerisch (Pollinations verlangt Zahl — sonst 400)
    const seed = new URL(await star.getAttribute('src')).searchParams.get('seed');
    expect(Number.isInteger(Number(seed))).toBe(true);
  });

  test('+ ist kontextsensitiv: im Verlauf → Einmalig, in Aufgaben → Neue Aufgabe (v4.25.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('#openAdd').click();
    await expect(page.getByRole('heading', { name: 'Neue Aufgabe' })).toBeVisible();
    await page.locator('#cancelChore').click();
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await page.locator('#openAdd').click();
    await expect(page.getByRole('heading', { name: 'Einmalig eintragen' })).toBeVisible();  // keine unsichtbare Kachel
  });

  test('Verlauf: Zeit bearbeitbar — Serie verschiebt sich um dasselbe Delta (v4.25.0)', async ({ context, page }) => {
    const serie = [1,2,3].map(i => ({ id: 'l-s'+i, chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: null,
      member_id: 'm-mira', member_name: 'Mira', points: 2, done_at: `2026-07-10T10:0${4-i}:00Z`, family_id: FAM }));
    await mockBackend(context, { logRows: () => serie });
    await context.route(`${SB}/rest/v1/log**`, r =>
      r.request().method() === 'PATCH' ? r.fulfill({ status: 204, body: '' }) : r.fallback());
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    const g = page.locator('.entry', { hasText: 'Mira' });
    await expect(g.locator('.xn')).toHaveText('×3');
    await g.click();
    const sh = page.locator('#logSheet');
    await expect(sh.getByText('verschiebt alle 3 gemeinsam')).toBeVisible();
    await setPickerTime(page, '2026-07-08', 8, 30);   // eigener Picker seit v4.82.0
    await sh.locator('#saveLog').click();
    await expect(g.locator('.xn')).toHaveText('×3');                 // Serie bleibt Serie (Delta!)
    // v4.32: Datum wandert in den Tages-Kopf, Zeile zeigt nur die Zeit
    await expect(page.locator('.dayhead', { hasText: '8. Juli' })).toBeVisible();
    await expect(g.locator('.when')).toContainText('08:30');         // neuester Eintrag exakt gesetzt
  });

  test('Delta-Sync: zweiter Boot zieht nur Neues (or=created_at/updated_at), merged korrekt (v4.36.0)', async ({ context, page }) => {
    const t0 = new Date(Date.now() - 3600e3).toISOString();
    const row1 = { id: 'l-a', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: null,
      member_id: 'm-mira', member_name: 'Mira', points: 2, done_at: t0, created_at: t0, updated_at: null, family_id: FAM };
    // ANDERE Aufgabe als row1 — sonst buendelt der Verlauf beide (gleicher
    // Tag + Person + Sache = eine ×2-Zeile) und der Count-Assert misst Unsinn
    const row2 = { id: 'l-b', chore_id: null, chore_name: 'Delta-Einmaliges', chore_note: null,
      member_id: 'm-mira', member_name: 'Mira', points: 3, done_at: new Date().toISOString(),
      created_at: new Date().toISOString(), updated_at: null, family_id: FAM };
    const logQueries = [];
    await mockBackend(context);
    await context.route(`${SB}/rest/v1/log**`, r => {
      const url = r.request().url(); logQueries.push(url);
      if (r.request().method() !== 'GET') return r.fallback();
      const delta = url.includes('or=');
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify(delta ? [row2] : [row1]) });
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry')).toHaveCount(1);              // Vollabgleich: row1
    await page.reload();                                              // zweiter Boot → Delta
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry')).toHaveCount(2);              // row1 (Cache) + row2 (Delta)
    expect(logQueries.some(u => u.includes('or=') && u.includes('created_at.gt.'))).toBe(true);
    expect(logQueries.filter(u => u.includes('/log?') && !u.includes('or=')).length).toBe(1); // nur EIN Vollabgleich (log_totals zaehlt nicht)
  });

  test('Backfill: migrierte Familie ohne write_key_hash bekommt ihn per PATCH (v4.36.0)', async ({ context, page }) => {
    const FX = 'famx-backfilltest01';
    let hashPatch = null;
    await context.route('**://fonts.googleapis.com/**', r => r.abort());
    await context.route('**://fonts.gstatic.com/**', r => r.abort());
    await context.route('**://gen.pollinations.ai/**', r => r.abort());
    await suppressOnboarding(context);
    await context.route(`${SB}/rest/v1/**`, async r => {
      const req = r.request(); const url = new URL(req.url());
      const table = url.pathname.split('/').pop();
      if (req.method() === 'PATCH' && table === 'families') { hashPatch = JSON.parse(req.postData()); return r.fulfill({ status: 204, body: '' }); }
      if (req.method() === 'GET' && table === 'families')
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ family_id: 'x', name: 'enc1:xx', write_key_hash: null }]) });
      if (req.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return r.fulfill({ status: 201, body: '' });
    });
    await page.addInitScript(fam => {
      localStorage.setItem('haushalt.v2:' + fam, JSON.stringify({ famName: 'X', members: [{ id: 'm1', name: 'I', color: '#fff' }], chores: [], log: [] }));
    }, FX);
    await page.goto(`${BASE}/f/${FX}`);
    await page.waitForTimeout(900);
    expect(hashPatch && /^[0-9a-f]{64}$/.test(hashPatch.write_key_hash)).toBe(true);
  });

  test('Folge-Tipp < 1 h akkumuliert Punkte in EINER Zeile; > 1 h neue Zeile (v4.35.0)', async ({ context, page }) => {
    const old = { id: 'l-old', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: null,
      member_id: 'm-mira', member_name: 'Mira', points: 2,
      done_at: new Date(Date.now() - 26 * 3600e3).toISOString(), family_id: FAM };   // gestern → Tagesgrenze trennt
    let patches = 0, posts = 0;
    await mockBackend(context, { logRows: () => [old] });
    await context.route(`${SB}/rest/v1/log**`, r => {
      // Seit v4.47.5 sind Create UND Merge POSTs — unterscheidbar am Body:
      // createRemote sendet EIN Objekt, upsertRemote ein ARRAY (merge-duplicates)
      if (r.request().method() === 'POST') {
        if (Array.isArray(r.request().postDataJSON())) patches++; else posts++;
        return r.fulfill({ status: 201, body: '' });
      }
      return r.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('.chip', { hasText: 'Mira' }).click();
    const tile = page.locator('.chore', { hasText: 'Müll rausbringen' });
    await tile.click();                       // > 1 h nach l-old (gestern) → NEUE Zeile
    await page.waitForTimeout(320);           // Geister-Klick-Filter (250 ms) verstreichen lassen
    await tile.click();                       // < 1 h → akkumuliert in dieselbe
    await page.waitForTimeout(320);
    await tile.click();                       // nochmal
    await page.waitForTimeout(400);
    expect(posts).toBe(1);                    // genau EINE neue Zeile
    expect(patches).toBe(2);                  // zwei Akkumulations-Upserts
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    const fresh = page.locator('.entry').first();
    await expect(fresh.locator('.pts')).toHaveText('+6');            // 3 × 2 Punkte, EINE Zeile
    await expect(fresh.locator('.xn')).toHaveCount(0);               // kein ×N (keine Serie)
    await expect(page.locator('.entry')).toHaveCount(2);             // plus die alte Zeile
  });

  test('Verlauf: Punkte einer Einzelzeile per Slider editierbar (gleiche UI wie Anlegen); Punkte-Ansicht folgt (v4.38.0)', async ({ context, page }) => {
    const row = { id: 'l-p', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: null,
      member_id: 'm-mira', member_name: 'Mira', points: 7, done_at: new Date().toISOString(), family_id: FAM };
    await mockBackend(context, { logRows: () => [row] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await page.locator('button.entry').first().click();
    // Gleiches Element wie im Anlege-Sheet: range-Slider mit Skalen-Regel
    await expect(page.locator('#lPts')).toHaveAttribute('type', 'range');
    await expect(page.locator('#lPts')).toHaveAttribute('max', '7');   // Bestand 7 > MAXPTS 5 schützt die Skala
    await page.locator('#lPts').fill('4');
    await expect(page.locator('#lPtsVal')).toHaveText('4');            // Output folgt live
    await page.locator('#saveLog').click();
    await expect(page.locator('.entry').first().locator('.pts')).toHaveText('+4');
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await expect(page.locator('.score', { hasText: 'Mira' }).locator('.num')).toHaveText('4');
  });

  test('Rechte: persönlicher Link kann nur EIGENE Verlaufs-Einträge bearbeiten (v4.38.0)', async ({ context, page }) => {
    const now = Date.now();
    const rows = [
      { id: 'l-own', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: null,
        member_id: 'm-mira', member_name: 'Mira', points: 2, done_at: new Date(now).toISOString(), family_id: FAM },
      { id: 'l-other', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: null,
        member_id: 'm-chris', member_name: 'Timon', points: 3, done_at: new Date(now - 60000).toISOString(), family_id: FAM },
    ];
    await mockBackend(context, { logRows: () => rows });
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    // Beide Zeilen sichtbar — Transparenz bleibt
    await expect(page.locator('.entry')).toHaveCount(2);
    // Eigene Zeile: Button mit Chevron, öffnet das Sheet
    const own = page.locator('.entry', { hasText: 'Mira' });
    await expect(own).toHaveJSProperty('tagName', 'BUTTON');
    // Fremde Zeile: KEIN Button, kein Chevron, öffnet nichts
    const other = page.locator('.entry', { hasText: 'Timon' });
    await expect(other).toHaveJSProperty('tagName', 'DIV');
    // Gesperrte Zeilen sind DIVs (kein Button = kein Edit) — das ✎ gibt es
    // seit v4.47.4 nirgends mehr im Verlauf
    await expect(other).toHaveJSProperty('tagName', 'DIV');
    await other.click();
    await expect(page.locator('#logSheet')).toHaveCount(0);
    await own.click();
    await expect(page.locator('#logSheet')).toBeVisible();
    // Admin (Familien-Link) darf weiterhin ALLES bearbeiten
    await page.locator('#closeLog').click();
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('button.entry')).toHaveCount(2);
  });

  test('Kopf: langer Familienname → volle Titelbreite, Buttons in eigener Zeile; kurzer Name teilt die Zeile (v4.40.0)', async ({ context, page }) => {
    await mockBackend(context);
    // families-Route NACH mockBackend registriert (letzte gewinnt), Name mutierbar
    let famName = 'Wohngemeinschaft Sonnenblumenweg';
    await context.route(`${SB}/rest/v1/families*`, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ family_id: FAM, name: famName }]),
    }));
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('#famTitle')).toHaveText('Wohngemeinschaft Sonnenblumenweg');
    await expect(page.locator('#apphead')).toHaveClass(/wide/);
    // Buttons stehen UNTER der Titelzeile
    const titleBox = await page.locator('.hrow').boundingBox();
    const btnBox = await page.locator('.headbtns').boundingBox();
    expect(btnBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 2);
    // Logo folgt der geschrumpften Titelstufe («so gross wie das R» je Stufe).
    // Erst die 180-ms-Transitions ausklingen lassen — sonst misst man mitten im Flug.
    await page.waitForTimeout(300);
    const fs = await page.locator('#famTitle').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    const lw = await page.locator('#headLogo').evaluate(el => parseFloat(getComputedStyle(el).width));
    expect(Math.abs(lw - fs)).toBeLessThan(0.5);   // Subpixel-Toleranz (Rundung fontSize vs. width)
    // Kurzer Name → geteiltes Layout bleibt. Boot-Cache leeren — sonst
    // bootet der Titel weiter lang. Merke: die Entscheidung ist INHALTS-,
    // nicht zeichengetrieben — die Tests laufen de-CH, dort sind die
    // Buttons («Einladen»/«Personen») breiter, und selbst «Fanti WG» oder
    // «Testhaushalt» brauchen daneben 3 Zeilen → korrekt wide. Für den
    // Geteilt-Fall darum ein wirklich kurzer Name:
    // …und auf Englisch: de-Buttons («Einladen»/«Personen», ~245 px) lassen
    // auf iPhone-Breite dem Titel nur ~43 px — dort geht selbst «WG 5»
    // korrekt wide. EN-Buttons geben auf BEIDEN Test-Viewports sicher Luft.
    famName = 'WG 5';
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('haushalt.lang', 'en'); });
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('#famTitle')).toHaveText('WG 5');
    await expect(page.locator('#apphead')).not.toHaveClass(/wide/);
    const t2 = await page.locator('.hrow').boundingBox();
    const b2 = await page.locator('.headbtns').boundingBox();
    expect(b2.y).toBeLessThan(t2.y + t2.height);
  });

  test('Kopf scrollt weg (KEIN Schrumpfen mehr), Tabs kleben deckend bei 0 (v4.42.0)', async ({ context, page }) => {
    await mockBackend(context);
    // Genug Inhalt zum Scrollen (letzte Route gewinnt)
    await context.route(`${SB}/rest/v1/chores*`, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(Array.from({ length: 24 }, (_, i) => (
        { id: 'c-' + i, name: 'Aufgabe ' + i, points: 1 + (i % 3), note: null, family_id: FAM }))),
    }));
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('.chore[data-cid]').first()).toBeVisible();
    const fs0 = await page.locator('#famTitle').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    await page.evaluate(() => new Promise(r => { window.scrollTo(0, 400); setTimeout(r, 80); }));
    // Kopf ist aus dem Bild gescrollt — und hat sich dabei NICHT verkleinert
    const head = await page.locator('#apphead').boundingBox();
    expect(head.y + head.height).toBeLessThanOrEqual(1);
    const fs1 = await page.locator('#famTitle').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(Math.abs(fs1 - fs0)).toBeLessThan(0.01);
    // v4.62.0: die klebende Leiste ist jetzt der BLOCK Chips+Tabs (#topbar).
    // Er klebt bei 0 und ist DECKEND; die Tabs sitzen direkt unter den Chips.
    const bar = await page.locator('#topbar').boundingBox();
    expect(Math.abs(bar.y)).toBeLessThanOrEqual(1);
    const tabs = await page.locator('.tabs').boundingBox();
    expect(tabs.y).toBeGreaterThanOrEqual(bar.y);
    expect(tabs.y + tabs.height).toBeLessThanOrEqual(bar.y + bar.height + 1);
    const bg = await page.locator('#topbar').evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg).not.toMatch(/rgba\(.*,\s*0\)/);   // kein transparenter Hintergrund
  });

  test('Einstellungen: Haushalt umbenennen — Titel folgt sofort, PATCH an families; persönlicher Link sieht die Option nicht (v4.41.0)', async ({ context, page }) => {
    await mockBackend(context);
    const patches = [];
    await context.route(`${SB}/rest/v1/families*`, async route => {
      const req = route.request();
      if (req.method() === 'PATCH') {
        patches.push(req.postDataJSON());
        await new Promise(r => setTimeout(r, 2000));   // Commit-Fenster (Race-Modell)
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();   // GETs weiter an den mockBackend-Handler (alter Name!)
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('#openSettings').click();
    await page.locator('#setName').click();
    await page.locator('#renName').fill('Villa Kunterbunt');
    await page.locator('#saveRename').click();
    await expect(page.locator('#famTitle')).toHaveText('Villa Kunterbunt');
    // Pull WÄHREND des offenen Commits (Server kennt noch den alten Namen):
    // die famName-Wache hält den lokalen Stand (v4.47.6 — Ausnahme getilgt)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(600);
    await expect(page.locator('#famTitle')).toHaveText('Villa Kunterbunt');
    await expect.poll(() => patches.length).toBeGreaterThan(0);
    expect(patches[0].name).toBe('Villa Kunterbunt');
    expect(patches[0].family_id).toBe(FAM);      // famScope/famRows zielen auf die Zeile
    // Reload: lokal persistiert (localStorage), Server-Mock liefert weiter den
    // alten Namen — der Boot zeigt zunächst den lokalen Stand
    // Persönlicher Link: KEIN Haushalts-Umbenennen, dafür «Mein Name»
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    await page.locator('#openSettings').click();
    await expect(page.locator('#settingsSheet')).toBeVisible();
    await expect(page.locator('#setName')).toHaveCount(0);
    await expect(page.locator('#setMyName')).toBeVisible();
  });

  test('Mein Name (v4.46.0): Mitglied benennt sich selbst um — Chip folgt sofort, PATCH zielt auf die eigene Zeile; Admin sieht die Option nicht', async ({ context, page }) => {
    await mockBackend(context);
    // Seit v4.46.1 läuft «Mein Name» über upsertRemote → POST (merge-
    // duplicates) mit Pull-Schutz — der Test fängt entsprechend POSTs
    const posts = [];
    await context.route(`${SB}/rest/v1/members*`, route => {
      const req = route.request();
      if (req.method() === 'POST') {
        posts.push({ url: req.url(), body: req.postDataJSON() });
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    await page.locator('#openSettings').click();
    await page.locator('#setMyName').click();
    await page.locator('#myName').fill('Mira-Lou');
    await page.locator('#saveMyName').click();
    // Chip in der ICH-BIN-Zeile folgt sofort
    await expect(page.locator('.iam .chip', { hasText: 'Mira-Lou' })).toBeVisible();
    await expect.poll(() => posts.length, { timeout: 10000 }).toBeGreaterThan(0);
    const row = [].concat(posts[0].body)[0];
    expect(row.name).toBe('Mira-Lou');
    expect(row.id).toBe('m-mira');                         // NUR die eigene Zeile im Body
    expect(posts[0].url).toContain('family_id=eq.');       // famScope bleibt dran
    // Admin (Familien-Link): kein «Mein Name» — die Personen-Verwaltung kann alle
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('#openSettings').click();
    await expect(page.locator('#setMyName')).toHaveCount(0);
    await expect(page.locator('#setName')).toBeVisible();
  });

  test('Sheets gleiten von unten herein; Verlauf nutzt dasselbe ✎ wie die Kacheln (v4.42.1)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    // Sheet öffnen → Slide-in-Animation aktiv
    await page.locator('#openShareTop').click();
    const anim = await page.locator('#shareSheet').evaluate(el => getComputedStyle(el).animationName);
    expect(anim).toBe('sheetIn');
    await page.locator('#doneShare').click();
    // Verlauf: Bearbeiten-Symbol ist das Kachel-✎, kein Chevron mehr
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    const row = page.locator('button.entry').first();
    // Kein ✎ und kein Chevron mehr (v4.47.4): die GANZE Zeile bedeutet
    // Bearbeiten — Deko-Symbole markieren hier nichts Eigenes
    await expect(row.locator('.editicon')).toHaveCount(0);
    await expect(row.locator('.chev')).toHaveCount(0);
    // reduced-motion: Animation ist AUS (globale Regel greift)
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#openShareTop').click();
    const anim2 = await page.locator('#shareSheet').evaluate(el => getComputedStyle(el).animationName);
    expect(anim2).toBe('none');
  });

  test('Swipe-to-dismiss: Runterwischen schliesst Sheets und Toasts; dirty-Guard blockt; kurzer Wisch federt zurück (v4.42.2)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    // Synthetische Touch-Geste OHNE Touch/TouchEvent-Konstruktoren (WebKit-
    // Linux kennt sie nicht): plain Event + definierte touches-Property —
    // der App-Handler liest nur e.touches[0].clientY und e.cancelable.
    const swipe = (sel, fromY, toY, ms) => page.evaluate(async ({ sel, fromY, toY, ms }) => {
      const el = document.querySelector(sel);
      const ev = (type, y) => {
        const e = new Event(type, { bubbles: true, cancelable: true });
        const touch = { identifier: 1, target: el, clientX: 200, clientY: y };
        Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [touch] });
        Object.defineProperty(e, 'changedTouches', { value: [touch] });
        return e;
      };
      const steps = 6;
      el.dispatchEvent(ev('touchstart', fromY));
      for (let i = 1; i <= steps; i++) {
        el.dispatchEvent(ev('touchmove', fromY + (toY - fromY) * i / steps));
        await new Promise(r => setTimeout(r, ms / steps));
      }
      el.dispatchEvent(ev('touchend', toY));
    }, { sel, fromY, toY, ms });

    // 1) Zügiger langer Wisch schliesst das Teilen-Sheet
    await page.locator('#openShareTop').click();
    await expect(page.locator('#shareSheet')).toBeVisible();
    await swipe('#shareSheet', 200, 420, 90);
    await expect(page.locator('#shareSheet')).toBeHidden();

    // 2) Kurzer, langsamer Wisch: Sheet bleibt (federt zurück)
    await page.locator('#openShareTop').click();
    await swipe('#shareSheet', 200, 250, 500);
    await page.waitForTimeout(300);
    await expect(page.locator('#shareSheet')).toBeVisible();
    await page.locator('#doneShare').click();

    // 3) Formular-Regel: dirty Aufgaben-Sheet lässt sich NICHT wegwischen
    await page.locator('.fab').click();
    await page.locator('#cName').fill('Halb getippt');
    await swipe('#choreSheet', 200, 420, 90);
    await page.waitForTimeout(300);
    await expect(page.locator('#choreSheet')).toBeVisible();
    await page.locator('#cancelChore').click();

    // 4) Toast wegwischen: Umbenennen zeigt «Gespeichert», Wisch verwirft sofort
    await page.locator('#openSettings').click();
    await page.locator('#setName').click();
    await page.locator('#renName').fill('Wischtest');
    await page.locator('#saveRename').click();
    await expect(page.locator('#toast')).toHaveClass(/show/);
    await swipe('#toast', 700, 760, 60);
    await expect(page.locator('#toast')).not.toHaveClass(/show/);
  });

  test('Einladen-Sheet: «Zum Home-Bildschirm»-Button erscheint NUR mit Android-Install-Prompt und feuert ihn (v4.44.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    // Ohne beforeinstallprompt (iOS / bereits installiert): KEIN Button —
    // dafür bleiben die aufklappbaren Anleitungen direkt unterm Admin-Block
    await page.locator('#openShareTop').click();
    await expect(page.locator('.savenote')).toBeVisible();
    await expect(page.locator('#shInstall')).toHaveCount(0);
    await page.locator('#doneShare').click();
    // Android-Fall: Prompt einfangen lassen (synthetisch), Sheet neu öffnen
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => { window.__prompted = true; };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    await page.locator('#openShareTop').click();
    const btn = page.locator('#shInstall');
    await expect(btn).toBeVisible();
    await btn.click();
    await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(true);
    await expect(btn).toHaveCount(0);   // nach Annahme verschwindet der Button
  });

  test('Install-Kette KOMPLETT: Empfänger eines geteilten Links sieht den Banner, «Jetzt installieren» feuert das native Prompt (v4.44.1)', async ({ context, page }) => {
    await mockBackend(context);
    // Empfänger-Perspektive: persönlicher Link (Miras geteilter Link)
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    // 1) Banner ist da — auch am persönlichen Link
    await expect(page.locator('#installBar')).toBeVisible();
    // 2) Android: natives Prompt trifft ein (synthetisch)
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => { window.__prompted = true; };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    // 3+4) Banner-Tap feuert das native Prompt DIREKT (nativ-zuerst, v4.45.0) —
    //      der Knopf in der Haupt-Ansicht IST der Banner; KEIN Umweg übers Sheet
    await page.locator('#installBarOpen').click();
    await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(true);
    await expect(page.locator('#installSheet')).toHaveCount(0);
    // 5) appinstalled räumt auf: Sheet zu, Banner weg, dauerhaft gemerkt
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(page.locator('#installSheet')).toBeHidden();
    await expect(page.locator('#installBar')).toBeHidden();
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    await expect(page.locator('#installBar')).toBeHidden();
  });

  test('Install-Prompt-RACE: trifft beforeinstallprompt erst NACH dem Öffnen ein, rüsten offene Sheets nach (v4.44.1)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    const fireBip = () => page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => { window.__prompted = true; };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    });
    // Share-Sheet ist bereits offen, DANN feuert Chrome das Prompt
    await page.locator('#openShareTop').click();
    await expect(page.locator('#shInstall')).toHaveCount(0);
    await fireBip();
    await expect(page.locator('#shInstall')).toBeVisible();     // Button rüstet nach
    await page.locator('#shInstall').click();
    await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(true);
    await page.locator('#doneShare').click();
    // Install-Sheet: offen mit Anleitungen, DANN feuert das Prompt
    await page.evaluate(() => { window.__prompted = false; });
    await page.reload();
    await page.locator('#installBarOpen').click();
    await expect(page.locator('#installGo')).toHaveText('Fertig');   // noch Anleitungs-Modus
    await fireBip();
    await expect(page.locator('#installGo')).toHaveText('Jetzt installieren');
    await page.locator('#installGo').click();
    await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(true);
  });

  test('Onboarding: Link-Empfänger sieht «Zugriff sichern» genau EINMAL; spätes Prompt rüstet den Android-Knopf nach (v4.45.0)', async ({ context, page }) => {
    await mockBackend(context);
    // Erstbesuch simulieren: Persona-Marke abschalten und entfernen
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    await page.evaluate(fam => {
      sessionStorage.setItem('fairli.obPersona.off', '1');
      localStorage.removeItem('haushalt.onboard:' + fam + ':u');
    }, FAM);
    await page.reload();
    await expect(page.locator('#onboardSheet h2')).toHaveText('Zugriff sichern');
    // KEINE Doppel-Botschaft: solange das Onboarding offen ist, schweigt der 📲-Banner
    await expect(page.locator('#installBar')).toBeHidden();
    await expect(page.locator('#onboardSheet .savenote')).toContainText('Dein Link ist dein Zugang');
    await expect(page.locator('#obInstall')).toHaveCount(0);   // ohne Prompt: Anleitungen
    // Spätes beforeinstallprompt rüstet den Knopf nach — und er feuert
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => { window.__prompted = true; };
      e.userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(e);
    });
    await expect(page.locator('#obInstall')).toBeVisible();
    await page.locator('#obInstall').click();
    await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(true);
    // Schliessen setzt die Marke: nie wieder (Persona bleibt aus — die Marke
    // stammt jetzt von der App selbst)
    await page.locator('#closeOnboard').click();
    // Ohne Installation geschlossen → Banner kehrt als Dauer-Erinnerung zurück
    await expect(page.locator('#installBar')).toBeVisible();
    await page.reload();
    await page.waitForTimeout(800);
    await expect(page.locator('#onboardSheet')).toHaveCount(0);
  });

  test('Person hinzufügen ÜBERLEBT den nächsten Pull; Umbenennen bestehender Personen hält (v4.46.1 — Live-Bugs)', async ({ context, page }) => {
    await mockBackend(context);
    const posts = [];
    // Ehrliches Race-Modell: der Server braucht 2 s bis zum Commit — der
    // Pull passiert WÄHRENDDESSEN und sieht die Schreibung noch nicht.
    // (Ein sofort bestätigter POST bei statischer GET-Liste wäre ein
    // unmöglicher Server: annehmen und dann leugnen.)
    await context.route(`${SB}/rest/v1/members*`, async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        posts.push(req.postDataJSON());
        await new Promise(r => setTimeout(r, 2000));
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fallback();   // GETs: Serverstand VOR dem Commit (ohne die Neue)
    });
    await page.goto(`${BASE}/f/${FAM}`);
    // 1) Person hinzufügen — exakt Timon' Ablauf: tippen, direkt «Fertig»
    //    (KEIN blur davor — die input-Events müssen genügen)
    await page.locator('#openMembers').click();
    await page.locator('#addMember').click();          // oeffnet direkt das Pro-Person-Sheet (v4.69.0)
    await expect(page.locator('#personSheet')).toBeVisible();
    await page.locator('#psName').fill('Nova');
    await page.locator('#psDone').click();
    await page.locator('#doneMembers').click();
    await expect(page.locator('.iam .chip', { hasText: 'Nova' })).toBeVisible();
    // 2) Der nächste Pull (Server kennt Nova noch nicht) darf sie NICHT schlucken
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(600);
    await expect(page.locator('.iam .chip', { hasText: 'Nova' })).toBeVisible();
    await expect.poll(() => posts.length).toBeGreaterThan(0);
    expect(JSON.stringify(posts)).toContain('Nova');
    // 3) Bestehende Person umbenennen — muss ebenso Pulls überleben
    await page.locator('#openMembers').click();
    await openPerson(page, 'm-mira');
    await page.locator('#psName').fill('Janine');
    await page.locator('#psDone').click();
    await page.locator('#doneMembers').click();
    await expect(page.locator('.iam .chip', { hasText: 'Janine' })).toBeVisible();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(600);
    await expect(page.locator('.iam .chip', { hasText: 'Janine' })).toBeVisible();   // NICHT zurück zu «Mira»
    await expect(page.locator('.iam .chip', { hasText: /^M\s*Mira$/ })).toHaveCount(0);
  });

  test('Kachel-Kunst: die Notiz fliesst in den Prompt ein; eigenes art-Feld bleibt allein massgeblich (v4.46.2)', async ({ context, page }) => {
    await mockBackend(context);
    await context.route(`${SB}/rest/v1/chores*`, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([
        { id: 'c-n', name: 'Kochen', points: 1, note: 'für zwei Personen', art: null, family_id: FAM },
        { id: 'c-a', name: 'Garten', points: 1, note: 'diese Notiz nicht', art: 'zen garden at dusk', family_id: FAM },
      ]),
    }));
    await page.goto(`${BASE}/f/${FAM}`);
    const src = sel => page.locator(sel).evaluate(el => decodeURIComponent(el.querySelector('img.art').src));
    const withNote = await src('.chore[data-cid="c-n"]');
    expect(withNote).toContain('Kochen, für zwei Personen');
    const withArt = await src('.chore[data-cid="c-a"]');
    expect(withArt).toContain('zen garden at dusk');
    expect(withArt).not.toContain('diese Notiz nicht');   // eigener Prompt gewinnt allein
  });

  test('Ersetzter Link: Grabstein → Vollbild-Hinweis, klebrig auch offline; ohne Grabstein kein Hinweis (v4.47.0)', async ({ context, page }) => {
    await mockBackend(context);
    // Ohne Grabstein: kein Overlay (mockBackend liefert [] für retired_families)
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(500);
    await expect(page.locator('#retiredOverlay')).toHaveCount(0);
    // Grabstein vorhanden → Hinweis, App dahinter unerreichbar
    await context.route(`${SB}/rest/v1/retired_families*`, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ family_id: FAM }]),
    }));
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('#retiredOverlay')).toBeVisible();
    await expect(page.locator('#retiredOverlay')).toContainText('Dieser Familien-Link wurde ersetzt');
    // Klebrig: auch wenn der Server nicht mehr antwortet (offline), bleibt der Hinweis
    await context.unroute(`${SB}/rest/v1/retired_families*`);
    await context.route(`${SB}/rest/v1/retired_families*`, route => route.abort());
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('#retiredOverlay')).toBeVisible();
  });

  test('Ersetzter Link: retired_families → klebriger Vollbild-Hinweis; normaler Link: nichts (v4.47.0)', async ({ context, page }) => {
    await mockBackend(context);
    // Normalfall: kein Hinweis (mockBackend liefert [] für retired_families)
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(600);
    await expect(page.locator('#retiredOverlay')).toHaveCount(0);
    // Grabstein-Fall: Route NACH mockBackend liefert den Eintrag
    await context.route(`${SB}/rest/v1/retired_families*`, route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify([{ family_id: FAM }]),
    }));
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('#retiredOverlay')).toBeVisible();
    await expect(page.locator('#retiredOverlay')).toContainText('Dieser Familien-Link wurde ersetzt');
    // KLEBRIG: auch wenn der Server danach nichts mehr liefert (offline/Cache),
    // bleibt der Hinweis — Grabsteine sind endgültig
    await context.unroute(`${SB}/rest/v1/retired_families*`);
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('#retiredOverlay')).toBeVisible();
  });

  test('Aufgabe umbenennen: Namenszeile direkt tappbar, neuer Name + neue Kunst überleben den Pull (v4.47.1 — Live-Bugs)', async ({ context, page }) => {
    await mockBackend(context);
    // Ehrliches Race-Modell wie beim Personen-Bug: Commit dauert 2 s,
    // der Pull passiert währenddessen und sieht die Schreibung nicht
    const posts = [];
    await context.route(`${SB}/rest/v1/chores*`, async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        posts.push(req.postDataJSON());
        await new Promise(r => setTimeout(r, 2000));
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    const tile = page.locator('.chore[data-cid]').first();
    await expect(tile).toBeVisible();
    const cid = await tile.getAttribute('data-cid');
    // 1) Bearbeiten öffnen: Name ist ein NORMALES, sofort editierbares Feld
    //    (v4.47.3, wie im Einmalig-Sheet) — aber OHNE Fokus beim Öffnen,
    //    damit keine Tastatur aufspringt
    await tile.locator('.edit').click();
    await expect(page.locator('#nameStatic')).toHaveCount(0);
    await expect(page.locator('#cName')).toBeVisible();
    await expect(page.locator('#cName')).not.toBeFocused();
    await expect(page.locator('#cName')).toHaveValue(/./);   // vorbefüllt
    // 2) Direkt reintippen und speichern — kein Zwischenschritt
    await page.locator('#cName').fill('Frisch umbenannt');
    await page.locator('#saveChore').click();
    // Kachel zeigt SOFORT den neuen Namen, Kunst-Prompt hängt am neuen Namen
    const tileNow = page.locator(`.chore[data-cid="${cid}"]`);
    await expect(tileNow).toContainText('Frisch umbenannt');
    const artSrc = await tileNow.locator('img.art').evaluate(el => decodeURIComponent(el.src));
    expect(artSrc).toContain('Frisch umbenannt');
    // 3) Pull WÄHREND des offenen Commits darf nichts zurückdrehen
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(600);
    await expect(tileNow).toContainText('Frisch umbenannt');
    await expect.poll(() => posts.length).toBeGreaterThan(0);
    const row = [].concat(posts[0])[0];
    expect(row.name).toBe('Frisch umbenannt');
    expect(row.id).toBe(cid);
  });

  test('Verlauf-Edit überlebt den Pull (v4.47.5 — letzte Race-Lücke aus dem Audit)', async ({ context, page }) => {
    await mockBackend(context);
    const posts = [];
    await context.route(`${SB}/rest/v1/log*`, async route => {
      const req = route.request();
      if (req.method() === 'POST') {
        posts.push(req.postDataJSON());
        await new Promise(r => setTimeout(r, 2000));   // Commit-Fenster
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await page.locator('button.entry').first().click();
    await page.locator('#lName').fill('Auditiert');
    await page.locator('#saveLog').click();
    await expect(page.locator('.entry', { hasText: 'Auditiert' }).first()).toBeVisible();
    // Pull WÄHREND des offenen Commits: Änderung bleibt
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(600);
    await expect(page.locator('.entry', { hasText: 'Auditiert' }).first()).toBeVisible();
    await expect.poll(() => posts.length).toBeGreaterThan(0);
    expect(JSON.stringify(posts[0])).toContain('Auditiert');
  });

  test('Betreute Mitglieder (v4.49.0): Admin-Toggle 📵; persönlicher Link zeigt selbst+betreut, loggt für die Katze, Pull hält die Auswahl; Mein Name bleibt selbst', async ({ context, page }) => {
    await mockBackend(context);
    // --- Admin: Toggle im Personen-Menü + Persistenz ---
    const posts = [];
    await context.route(`${SB}/rest/v1/members*`, route => {
      const req = route.request();
      if (req.method() === 'POST') { posts.push(req.postDataJSON()); return route.fulfill({ status: 201, body: '' }); }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('#openMembers').click();
    await openPerson(page, 'm-chris');
    await page.locator('#psAssist').click();
    await expect(page.locator('#psAssist .setval')).toHaveText('An');
    await page.locator('#psDone').click();
    await expect(page.locator('.prow[data-pid="m-chris"] .assistbadge', { hasText: '📵' })).toBeVisible();   // sofort sichtbar
    // v4.69.1: «Speichern» im Pro-Person-Sheet speichert SELBST — der POST
    // kommt, BEVOR die Liste geschlossen wird
    await expect.poll(() => posts.length).toBeGreaterThan(0);
    await page.locator('#doneMembers').click();
    const saved = [].concat(posts[0]).find(r => r.id === 'm-chris');
    expect(saved.assisted).toBe(true);
    // Erneutes Öffnen: Badge in der Zeile, Schalter im Sheet auf An (Zustand hält)
    await page.locator('#openMembers').click();
    await expect(page.locator('.prow[data-pid="m-chris"] .assistbadge', { hasText: '📵' })).toBeVisible();
    await openPerson(page, 'm-chris');
    await expect(page.locator('#psAssist .setval')).toHaveText('An');
    await page.locator('#psDone').click();
  });

  test('Betreute Mitglieder: persönlicher Link — Chips, Fremd-Logging, Rechte (v4.49.0)', async ({ context, page }) => {
    await mockBackend(context);
    // Server sagt: Noel ist betreut
    const logPosts = [];
    await context.route(`${SB}/rest/v1/members*`, route => {
      if (route.request().method() !== 'GET') return route.fallback();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', assisted: false },
        { id: 'm-timon', name: 'Timon', color: '#2E7D32', family_id: FAM, url_slug: 'slugt1', assisted: false },
        { id: 'm-noel', name: 'Noel', color: '#B26500', family_id: FAM, url_slug: null, assisted: true },
      ]) });
    });
    await context.route(`${SB}/rest/v1/log*`, route => {
      const req = route.request();
      if (req.method() === 'POST') { logPosts.push(req.postDataJSON()); return route.fulfill({ status: 201, body: '' }); }
      if (req.method() !== 'GET') return route.fallback();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { id: 'l-n', chore_id: 'c-1', chore_name: 'Müll rausbringen', member_id: 'm-noel', member_name: 'Noel',
          points: 1, done_at: '2026-07-18T10:00:00Z', family_id: FAM },
        { id: 'l-t', chore_id: 'c-1', chore_name: 'Müll rausbringen', member_id: 'm-timon', member_name: 'Timon',
          points: 1, done_at: '2026-07-18T09:00:00Z', family_id: FAM },
      ]) });
    });
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    // Chips: selbst + betreut, NICHT Timon
    await expect(page.locator('.iam .chip', { hasText: 'Mira' })).toBeVisible();
    await expect(page.locator('.iam .chip', { hasText: 'Noel' })).toBeVisible();
    await expect(page.locator('.iam .chip', { hasText: 'Timon' })).toHaveCount(0);
    // Für die Katze eintragen
    await page.locator('.iam .chip', { hasText: 'Noel' }).click();
    await page.locator('.chore', { hasText: 'Müll rausbringen' }).click();
    await page.waitForTimeout(350);
    await expect.poll(() => logPosts.length).toBeGreaterThan(0);
    expect(JSON.stringify(logPosts[0])).toContain('m-noel');
    // Pull reisst die Auswahl NICHT zurück
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(600);
    await expect(page.locator('.iam .chip', { hasText: 'Noel' })).toHaveAttribute('aria-pressed', 'true');
    // «Mein Name» bleibt die LINK-Identität (Mira), nicht die Chip-Auswahl
    await page.locator('#openSettings').click();
    await expect(page.locator('#setMyName .setval')).toHaveText('Mira');
    await page.locator('#setMyName').click();
    await expect(page.locator('#myName')).toHaveValue('Mira');
    await page.locator('#closeMyName').click();   // Einstellungen sind dabei schon zu
    // Verlauf-Rechte: Noels Eintrag editierbar (Button), Timons nicht (DIV)
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    // Noels Eintrag ist editierbar (Button), Timons NICHT (DIV) — Rechte folgen
    // der erlaubten Menge, nicht mehr nur «ich selbst»
    await expect(page.locator('button.entry', { hasText: 'Noel' }).first()).toBeVisible();
    await expect(page.locator('button.entry', { hasText: 'Timon' })).toHaveCount(0);
    await expect(page.locator('.entry', { hasText: 'Timon' }).first()).toBeVisible();
  });

  test('Suche (v4.50.0): standardmässig AUS, per Einstellung an; filtert Aufgaben und Verlauf, diakritik-blind, Leer-Zustand, Fokus bleibt', async ({ context, page }) => {
    await mockBackend(context, { logRows: () => [
      { id: 'l-1', chore_id: 'c-1', chore_name: 'Küche aufräumen', chore_note: 'nur Abwasch',
        member_id: 'm-mira', member_name: 'Mira', points: 2, done_at: '2026-07-18T10:00:00Z', family_id: FAM },
      { id: 'l-2', chore_id: 'c-2', chore_name: 'Müll rausbringen', chore_note: '',
        member_id: 'm-chris', member_name: 'Timon', points: 1, done_at: '2026-07-18T09:00:00Z', family_id: FAM },
    ] });
    await context.route(`${SB}/rest/v1/chores*`, route => route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
          { id: 'c-1', name: 'Küche aufräumen', points: 2, note: 'nur Abwasch', family_id: FAM },
          { id: 'c-2', name: 'Müll rausbringen', points: 1, note: '', family_id: FAM },
          { id: 'c-3', name: 'Wäsche', points: 1, note: 'Küchentücher mitwaschen', family_id: FAM },
        ]) })
      : route.fallback());
    await page.goto(`${BASE}/f/${FAM}`);
    // AUS by default
    await expect(page.locator('#searchBar')).toBeHidden();
    // Einschalten über die Einstellungen
    await page.locator('#openSettings').click();
    await expect(page.locator('#setSearch .setval')).toHaveText('Aus');
    await page.locator('#setSearch').click();
    await expect(page.locator('#searchBar')).toBeVisible();
    // a) Aufgaben filtern — «kü» findet Name UND Notiz-Treffer
    await page.locator('#searchInput').fill('kü');
    await expect(page.locator('.chore[data-cid="c-1"]')).toBeVisible();
    await expect(page.locator('.chore[data-cid="c-3"]')).toBeVisible();   // «Küchentücher» in der Notiz
    await expect(page.locator('.chore[data-cid="c-2"]')).toHaveCount(0);
    await expect(page.locator('#oneOffTile')).toHaveCount(0);   // passt nicht zur Suche → raus
    // Diakritik-blind: «ku» findet «Küche» genauso
    await page.locator('#searchInput').fill('ku');
    await expect(page.locator('.chore[data-cid="c-1"]')).toBeVisible();
    // Fokus bleibt beim Tippen erhalten (Leiste liegt ausserhalb der Liste)
    await expect(page.locator('#searchInput')).toBeFocused();
    // Leer-Zustand
    await page.locator('#searchInput').fill('zzz');
    await expect(page.locator('.empty')).toContainText('Nichts gefunden');
    // b) Verlauf filtern — Aufgabe, Notiz und Person
    await page.locator('#searchInput').fill('küche');
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry', { hasText: 'Küche aufräumen' })).toHaveCount(1);
    await expect(page.locator('.entry', { hasText: 'Müll' })).toHaveCount(0);
    await page.locator('#searchInput').fill('timon');
    await expect(page.locator('.entry', { hasText: 'Müll' })).toHaveCount(1);
    // Punkte-Ansicht: keine Suchleiste
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await expect(page.locator('#searchBar')).toBeHidden();
    // Leeren-Knopf + Ausschalten räumt auf
    await page.getByRole('tab', { name: 'Aufgaben' }).click();
    await page.locator('#searchClear').click();
    await expect(page.locator('.chore[data-cid="c-2"]')).toBeVisible();
    await page.locator('#openSettings').click();
    await page.locator('#setSearch').click();
    await expect(page.locator('#searchBar')).toBeHidden();
  });

  test('Suche schaltet sich bei mehr als 7 Kacheln selbst ein — respektiert aber eine eigene Entscheidung (v4.51.0)', async ({ context, page }) => {
    const many = n => Array.from({ length: n }, (_, i) => ({ id: 'c-' + i, name: 'Aufgabe ' + i, points: 1, note: '', family_id: FAM }));
    // a) 7 Kacheln → bleibt AUS
    await mockBackend(context);
    let count = 7;
    await context.route(`${SB}/rest/v1/chores*`, route => route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(many(count)) })
      : route.fallback());
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('.chore[data-cid]')).toHaveCount(7);
    await expect(page.locator('#searchBar')).toBeHidden();
    // b) 8 Kacheln → schaltet sich selbst ein, mit Hinweis
    count = 8;
    await page.reload();
    await expect(page.locator('#searchBar')).toBeVisible();
    await expect(page.locator('#toast')).toContainText('Suche aktiviert');
    // c) Wer selbst ausschaltet, wird NICHT überstimmt — auch nach Neuladen nicht
    await page.locator('#openSettings').click();
    await page.locator('#setSearch').click();               // → Aus (schreibt die Entscheidung)
    await expect(page.locator('#searchBar')).toBeHidden();
    await page.reload();
    await expect(page.locator('.chore[data-cid]')).toHaveCount(8);
    await expect(page.locator('#searchBar')).toBeHidden();  // bleibt aus
  });

  test('Aufbewahrung (v4.52.0): Standard unbegrenzt, Admin-only, Abbruch löscht NICHTS', async ({ context, page }) => {
    const days = n => new Date(Date.now() - n * 86400e3).toISOString();
    await mockBackend(context, { logRows: () => [
      { id: 'l-alt', chore_id: 'c-1', chore_name: 'Müll rausbringen', member_id: 'm-mira', member_name: 'Mira', points: 1, done_at: days(120), family_id: FAM },
      { id: 'l-neu', chore_id: 'c-1', chore_name: 'Müll rausbringen', member_id: 'm-mira', member_name: 'Mira', points: 1, done_at: days(2), family_id: FAM },
    ] });
    const dels = [], patches = [];
    await context.route(`${SB}/rest/v1/log*`, route => {
      if (route.request().method() === 'DELETE') { dels.push(route.request().url()); return route.fulfill({ status: 204, body: '' }); }
      return route.fallback();
    });
    await context.route(`${SB}/rest/v1/families*`, route => {
      if (route.request().method() === 'PATCH') { patches.push(route.request().postDataJSON()); return route.fulfill({ status: 204, body: '' }); }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    // 1) Standard: unbegrenzt — der 120 Tage alte Eintrag bleibt, nichts wird gelöscht
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry')).toHaveCount(2);
    await page.waitForTimeout(700);
    expect(dels).toHaveLength(0);
    await page.locator('#openSettings').click();
    await expect(page.locator('#setRetention .setval')).toHaveText('Unbegrenzt');
    // 2) Abbruch im Bestätigungsdialog → nichts gespeichert, nichts gelöscht
    page.once('dialog', d => d.dismiss());
    await page.locator('#setRetention').click();
    await page.locator('[data-ret="30"]').click();
    await page.waitForTimeout(600);
    expect(patches).toHaveLength(0);
    expect(dels).toHaveLength(0);
    await expect(page.locator('#retentionSheet')).toBeVisible();   // Sheet bleibt offen
  });

  test('Aufbewahrung: bestätigte 30 Tage löscht NUR alte Log-Einträge — Aufgaben, Personen, junge Einträge bleiben', async ({ context, page }) => {
    const days = n => new Date(Date.now() - n * 86400e3).toISOString();
    await mockBackend(context, { logRows: () => [
      { id: 'l-120', chore_id: 'c-1', chore_name: 'Müll rausbringen', member_id: 'm-mira', member_name: 'Mira', points: 1, done_at: days(120), family_id: FAM },
      { id: 'l-31', chore_id: 'c-1', chore_name: 'Müll rausbringen', member_id: 'm-mira', member_name: 'Mira', points: 1, done_at: days(31), family_id: FAM },
      { id: 'l-29', chore_id: 'c-1', chore_name: 'Müll rausbringen', member_id: 'm-mira', member_name: 'Mira', points: 1, done_at: days(29), family_id: FAM },
      { id: 'l-1', chore_id: 'c-1', chore_name: 'Müll rausbringen', member_id: 'm-mira', member_name: 'Mira', points: 1, done_at: days(1), family_id: FAM },
    ] });
    const dels = [], patches = [], otherDels = [];
    await context.route(`${SB}/rest/v1/log*`, route => {
      if (route.request().method() === 'DELETE') { dels.push(decodeURIComponent(route.request().url())); return route.fulfill({ status: 204, body: '' }); }
      return route.fallback();
    });
    for (const tbl of ['members', 'chores', 'families']) {
      await context.route(`${SB}/rest/v1/${tbl}*`, route => {
        const m = route.request().method();
        if (m === 'DELETE') { otherDels.push(tbl); return route.fulfill({ status: 204, body: '' }); }
        if (m === 'PATCH') { patches.push(route.request().postDataJSON()); return route.fulfill({ status: 204, body: '' }); }
        return route.fallback();
      });
    }
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('#openSettings').click();
    let dialogText = '';
    page.once('dialog', d => { dialogText = d.message(); d.accept(); });
    await page.locator('#setRetention').click();
    await page.locator('[data-ret="30"]').click();
    // Bestätigung nennt die betroffene Anzahl (120 und 31 Tage alt = 2)
    expect(dialogText).toContain('2');
    await expect.poll(() => patches.length).toBeGreaterThan(0);
    expect(patches[0].retention_days).toBe(30);
    // Genau die zwei alten Einträge gelöscht — die jungen NICHT
    await expect.poll(() => dels.length).toBe(2);
    // Exakte IDs vergleichen — «l-1» ist Teilstring von «l-120» (Fallstrick!)
    const deleted = dels.map(u => (u.match(/id=eq\.([^&]+)/) || [])[1]).sort();
    expect(deleted).toEqual(['l-120', 'l-31']);
    // NICHTS ausserhalb des Verlaufs angefasst
    expect(otherDels).toHaveLength(0);
    // Liste zeigt nur noch die jungen Einträge, Aufgaben unverändert da
    // (das Sheet schliesst sich beim Auswählen selbst — nicht nochmal klicken,
    //  ein Klick auf ein geschlossenes Element wartet bis zum Test-Timeout)
    await expect(page.locator('#retentionSheet')).toBeHidden();
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry')).toHaveCount(2);
    await page.getByRole('tab', { name: 'Aufgaben' }).click();
    await expect(page.locator('.chore[data-cid="c-1"]')).toBeVisible();
  });

  test('Aufbewahrung: persönlicher Link sieht die Einstellung nicht und löscht nichts (v4.52.0)', async ({ context, page }) => {
    const days = n => new Date(Date.now() - n * 86400e3).toISOString();
    await mockBackend(context, { logRows: () => [
      { id: 'l-alt', chore_id: 'c-1', chore_name: 'Müll rausbringen', member_id: 'm-mira', member_name: 'Mira', points: 1, done_at: days(200), family_id: FAM },
    ] });
    const dels = [];
    await context.route(`${SB}/rest/v1/log*`, route => {
      if (route.request().method() === 'DELETE') { dels.push(route.request().url()); return route.fulfill({ status: 204, body: '' }); }
      return route.fallback();
    });
    // Haushalt hat 30-Tage-Aufbewahrung eingestellt
    await context.route(`${SB}/rest/v1/families*`, route => route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ family_id: FAM, name: 'Fanti WG', retention_days: 30 }]) })
      : route.fallback());
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    await page.waitForTimeout(900);
    // Kein Aufräumen von diesem Gerät (nur der Admin-Link räumt auf)
    expect(dels).toHaveLength(0);
    await page.locator('#openSettings').click();
    await expect(page.locator('#setRetention')).toHaveCount(0);
  });

  test('Bild-Idee (v4.53.0): steuert allein das Kachelbild, erscheint aber NIRGENDS im Text; leeren fällt auf Name+Notiz zurück', async ({ context, page }) => {
    await mockBackend(context, { logRows: () => [
      { id: 'l-1', chore_id: 'c-1', chore_name: 'Rasen mähen', chore_note: 'hinterm Haus',
        member_id: 'm-mira', member_name: 'Mira', points: 1, done_at: new Date().toISOString(), family_id: FAM },
    ] });
    await context.route(`${SB}/rest/v1/chores*`, route => route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
          { id: 'c-1', name: 'Rasen mähen', points: 1, note: 'hinterm Haus', art: null, family_id: FAM }]) })
      : route.fallback());
    await page.goto(`${BASE}/f/${FAM}`);
    const tile = page.locator('.chore[data-cid="c-1"]');
    const artOf = () => tile.locator('img.art').evaluate(el => decodeURIComponent(el.src));
    // Ausgangslage: Prompt = Name + Notiz
    expect(await artOf()).toContain('Rasen mähen, hinterm Haus');
    // Bild-Idee setzen
    await tile.locator('.edit').click();
    await expect(page.locator('#cArt')).toHaveValue('');            // leer, weil art null
    await page.locator('#cArt').fill('mowing the lawn with a lawnmower');
    await page.locator('#saveChore').click();
    // Prompt besteht NUR aus der Bild-Idee
    const withHint = await artOf();
    expect(withHint).toContain('mowing the lawn with a lawnmower');
    expect(withHint).not.toContain('Rasen mähen');
    expect(withHint).not.toContain('hinterm Haus');
    // Text bleibt unangetastet: Kachel zeigt Name + Notiz, NICHT die Bild-Idee
    await expect(tile).toContainText('Rasen mähen');
    await expect(tile).toContainText('hinterm Haus');
    await expect(tile).not.toContainText('lawnmower');
    // Auch der Verlauf zeigt sie nicht
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry').first()).toContainText('Rasen mähen');
    await expect(page.locator('#list')).not.toContainText('lawnmower');
    // Wieder leeren → zurück auf Name + Notiz
    await page.getByRole('tab', { name: 'Aufgaben' }).click();
    await tile.locator('.edit').click();
    await expect(page.locator('#cArt')).toHaveValue('mowing the lawn with a lawnmower');
    await page.locator('#cArt').fill('');
    await page.locator('#saveChore').click();
    expect(await artOf()).toContain('Rasen mähen, hinterm Haus');
  });

  test('Wer hat verbucht (v4.54.0): persönlicher Link schreibt logged_by, Familien-Link nicht; Detail-Sheet zeigt es', async ({ context, page }) => {
    await mockBackend(context);
    const posts = [];
    await context.route(`${SB}/rest/v1/log*`, route => {
      const req = route.request();
      if (req.method() === 'POST') { posts.push(req.postDataJSON()); return route.fulfill({ status: 201, body: '' }); }
      return route.fallback();
    });
    // a) Persönlicher Link (Mira) → logged_by = m-mira
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    await page.locator('.chore', { hasText: 'Müll rausbringen' }).click();
    await page.waitForTimeout(350);
    await expect.poll(() => posts.length).toBeGreaterThan(0);
    expect([].concat(posts[0])[0].logged_by).toBe('m-mira');
    // b) Familien-Link → logged_by null (gehört niemandem einzeln)
    posts.length = 0;
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('.chip', { hasText: 'Mira' }).click();
    await page.locator('.chore', { hasText: 'Müll rausbringen' }).click();
    await page.waitForTimeout(350);
    await expect.poll(() => posts.length).toBeGreaterThan(0);
    expect([].concat(posts[0])[0].logged_by).toBeNull();
  });

  test('Wer hat verbucht: Detail-Sheet nennt die Person bzw. den Familien-Link (v4.54.0)', async ({ context, page }) => {
    await mockBackend(context, { logRows: () => [
      { id: 'l-proxy', chore_id: 'c-1', chore_name: 'Fressen geben', member_id: 'm-chris', member_name: 'Timon',
        logged_by: 'm-mira', points: 1, done_at: new Date().toISOString(), family_id: FAM },
      { id: 'l-fam', chore_id: 'c-1', chore_name: 'Müll rausbringen', member_id: 'm-mira', member_name: 'Mira',
        logged_by: null, points: 1, done_at: new Date(Date.now() - 3600e3).toISOString(), family_id: FAM },
    ] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    // Stellvertretend eingetragen: nennt Mira — die Liste selbst bleibt unverändert schlank
    await expect(page.locator('.entry').first()).not.toContainText('Eingetragen');
    await page.locator('button.entry', { hasText: 'Fressen geben' }).click();
    await expect(page.locator('#logSheet')).toContainText('Eingetragen von Mira');
    await page.locator('#logSheet .x').click();
    // Über den Familien-Link erfasst
    await page.locator('button.entry', { hasText: 'Müll rausbringen' }).click();
    await expect(page.locator('#logSheet')).toContainText('Familien-Link');
  });

  test('Admin ist eine Eigenschaft von Personen (v4.55.0): Admin-Link gibt volle Rechte, Nicht-Admin nicht', async ({ context, page }) => {
    const MEM = () => [
      { id: 'm-chris', name: 'Timon', color: '#2FAE6A', family_id: FAM, url_slug: 'slugchris1', admin: true },
      { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', admin: false },
    ];
    await mockBackend(context, { memberRows: MEM });
    // a) Admin über den EIGENEN persönlichen Link: Personen-Knopf + Admin-Einstellungen
    await page.goto(`${BASE}/f/${FAM}/u/slugchris1`);
    await expect(page.locator('#openMembers')).toBeVisible();
    await expect(page.locator('html')).not.toHaveClass(/userlink/);
    await page.locator('#openSettings').click();
    await expect(page.locator('#setName')).toBeVisible();        // Haushaltsname
    await expect(page.locator('#setRetention')).toBeVisible();   // Aufbewahrung
    await expect(page.locator('#setMyName')).toBeVisible();      // hat trotzdem eine Identität
    await page.locator('#closeSettings').click();
    // Admin darf für alle eintragen (alle Chips sichtbar)
    await expect(page.locator('.iam .chip')).toHaveCount(2);
    // b) Nicht-Admin: keine Personen-Verwaltung, keine Admin-Einstellungen
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    await expect(page.locator('#openMembers')).toBeHidden();
    await page.locator('#openSettings').click();
    await expect(page.locator('#setName')).toHaveCount(0);
    await expect(page.locator('#setRetention')).toHaveCount(0);
    await expect(page.locator('#setMyName')).toBeVisible();
    await page.locator('#closeSettings').click();
    // … darf aber Links teilen (alle Personen)
    await page.locator('#openShareTop').click();
    await expect(page.locator('#shareSheet .shrow [data-share]:not([data-app])')).toHaveCount(2);   // beide Personen (die Empfehlen-Zeile zählt nicht)
  });

  test('Admin-Schalter: nur Admins, und der letzte Admin bleibt (v4.55.0)', async ({ context, page }) => {
    const posts = [];
    await mockBackend(context, { memberRows: () => [
      { id: 'm-chris', name: 'Timon', color: '#2FAE6A', family_id: FAM, url_slug: 'slugchris1', admin: true },
      { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', admin: false },
    ] });
    await context.route(`${SB}/rest/v1/members*`, route => {
      const req = route.request();
      if (req.method() === 'POST') { posts.push(req.postDataJSON()); return route.fulfill({ status: 201, body: '' }); }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('#openMembers').click();
    // Timon ist Admin: 🔑 in der Zeile
    const timonRow = page.locator('.prow[data-pid="m-chris"]');
    await expect(timonRow.locator('.assistbadge', { hasText: '🔑' })).toBeVisible();
    // Letzten Admin entziehen → verweigert
    await openPerson(page, 'm-chris');
    await page.locator('#psAdmin').click();
    await expect(page.locator('#toast')).toContainText('Mindestens eine Person muss Admin bleiben');
    await expect(page.locator('#psAdmin .setval')).toHaveText('An');                    // unverändert
    await page.locator('#psDone').click();
    // Zweiten Admin ernennen, DANN darf der erste abgeben
    await openPerson(page, 'm-mira');
    await page.locator('#psAdmin').click();
    await expect(page.locator('#psAdmin .setval')).toHaveText('An');
    await page.locator('#psDone').click();
    await expect(page.locator('.prow[data-pid="m-mira"] .assistbadge', { hasText: '🔑' })).toBeVisible();
    await openPerson(page, 'm-chris');
    await page.locator('#psAdmin').click();
    await expect(page.locator('#psAdmin .setval')).toHaveText('Aus');
    await page.locator('#psDone').click();
    await expect(timonRow.locator('.assistbadge', { hasText: '🔑' })).toHaveCount(0);
    await page.locator('#doneMembers').click();
    await expect.poll(() => posts.length).toBeGreaterThan(0);
    // v4.69.1: jedes Sheet-Schliessen speichert selbst — die Aenderungen
    // kommen ueber MEHRERE POSTs verteilt; es zaehlt der LETZTE Stand je Person
    const all = posts.flat();
    const last = id => [...all].reverse().find(r => r.id === id);
    expect(last('m-mira').admin).toBe(true);
    expect(last('m-chris').admin).toBe(false);
  });

  test('Manifest-Regel (v4.56.0): nie auf iOS — auf Android/Desktop in BEIDEN Kontexten', async ({ context, page, browserName }) => {
    await mockBackend(context, { memberRows: () => [
      { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', admin: false },
    ] });
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    const links = page.locator('link[rel=manifest]');
    if (browserName === 'webkit') {
      // WebKit backt start_url beim PARSEN ein — ohne Manifest nimmt iOS die
      // aktuelle URL, und genau das wollen wir für persönliche Links.
      await expect(links).toHaveCount(0);
    } else {
      await expect(links).toHaveCount(1);
      const href = await links.getAttribute('href');
      expect(href.startsWith('data:')).toBe(false);          // data: ist nicht installierbar
      expect(href).toContain('/chores/manifest.json?');
      expect(href).toContain('u=slugmira1');
    }
  });

  test('Installierbarkeit (v4.56.0): auch ohne Service Worker liefert die Manifest-Adresse ein gültiges Manifest', async ({ context, page, browserName }) => {
    test.skip(browserName === 'webkit', 'iOS ist bewusst manifest-frei');
    await mockBackend(context, { memberRows: () => [
      { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', admin: false },
    ] });
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    // Hier ist der SW geblockt → es antwortet der statische Host. Genau das
    // sieht ein Abrufer, der den Service Worker nicht kennt; auch dieser Fall
    // MUSS installierbar sein.
    const man = await page.evaluate(async () => {
      const h = document.querySelector('link[rel=manifest]').href;
      return JSON.parse(await (await fetch(h)).text());
    });
    expect(man.display).toBe('standalone');
    expect(man.start_url).toBeTruthy();
    // auch der statische Fallback startet dunkel, nicht weiss
    expect(man.background_color.toUpperCase()).toBe('#12161F');
    expect(man.icons.map(i => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    // Familien-Link unverändert: die statische Datei
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', '/chores/manifest.json');
  });

  test('Start am generischen start_url landet bei der ZULETZT benutzten Route (v4.56.0)', async ({ context, page }) => {
    await mockBackend(context, { memberRows: () => [
      { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', admin: false },
    ] });
    // Gerät kennt BEIDE Routen — typisch für einen Admin, der früher den
    // blanken Link benutzt hat. Zuletzt benutzt: der persönliche.
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(300);
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    await page.waitForTimeout(300);
    await page.goto(`${BASE}/`);                        // wie der Homescreen-Start
    await expect(page).toHaveURL(new RegExp(`/f/${FAM}/u/slugmira1$`));
    // Andersherum genauso: zuletzt der Familien-Link
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(300);
    await page.goto(`${BASE}/`);
    await expect(page).toHaveURL(new RegExp(`/f/${FAM}$`));
  });

  test('@sw Installierbarkeit: der Service Worker liefert das persönliche Manifest von GLEICHER Herkunft (v4.56.0)', async ({ context, page }) => {
    await mockBackend(context, { memberRows: () => [
      { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', admin: false },
    ] });
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
    await page.reload();
    await page.waitForTimeout(500);
    const man = await page.evaluate(async () => {
      const h = document.querySelector('link[rel=manifest]').href;
      const r = await fetch(h);
      return { type: r.headers.get('content-type'), body: JSON.parse(await r.text()) };
    });
    expect(man.type).toContain('manifest');
    expect(man.body.start_url).toContain(`/f/${FAM}/u/slugmira1`);
    expect(man.body.id).toBe(man.body.start_url);       // eigene App-Identität je Person
    expect(man.body.name).toContain('Mira');            // Vollname nennt die Person
    // ABER: Android beschriftet das Symbol mit short_name — der muss «Fairli»
    // bleiben, sonst heisst die App auf dem Startbildschirm wie die Person
    // (Live-Befund 20.07.2026).
    expect(man.body.short_name).toBe('Fairli');
    // Start-Bildschirm darf nicht weiss aufblitzen: Farben = App-Farben
    expect(man.body.background_color.toUpperCase()).toBe('#12161F');
    expect(man.body.theme_color.toUpperCase()).toBe('#141A17');
    expect(man.body.scope).toContain('/chores/');
    expect(man.body.icons.every(i => /^https?:\/\//.test(i.src))).toBe(true);
  });

  test('Ersteinrichtung (v4.57.0): «Wer bist du?» — Gewählte wird Admin, Ersteller landet auf IHREM persönlichen Link', async ({ context, page }) => {
    const FAMN = 'neufam-xyz98765';
    const store = { members: [], chores: [], families: [], log: [] };
    await context.route(`${SB}/rest/v1/**`, r => {
      const req = r.request();
      const table = ['members', 'chores', 'families', 'log', 'retired_families'].find(x => req.url().includes('/' + x)) || 'log';
      if (table === 'retired_families') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      if (req.method() === 'POST') {
        [].concat(req.postDataJSON()).forEach(x => {
          const i = store[table].findIndex(y => y.id === x.id || (table === 'families' && y.family_id === x.family_id));
          if (i >= 0) store[table][i] = { ...store[table][i], ...x }; else store[table].push(x);
        });
        return r.fulfill({ status: 201, body: '' });
      }
      if (req.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(store[table] || []) });
      return r.fulfill({ status: 204, body: '' });
    });
    await blockExternal(context);
    await page.goto(`${BASE}/f/${FAMN}`);
    await page.locator('#frName').fill('Fanti WG');
    await page.locator('#frMembers').fill('Anna\nBen\nCarla');
    await page.locator('#frSeed').uncheck();
    await page.locator('#frGo').click();
    // Der Zwischenschritt fragt, wer man ist — NIEMAND ist bis dahin Admin
    await expect(page.getByRole('heading', { name: 'Wer bist du?' })).toBeVisible();
    expect(store.members.every(m => !m.admin)).toBe(true);
    // Die Erstellerin ist CARLA (dritte Zeile!) — genau der Fall, in dem die
    // alte Regel «erste Zeile = Admin» stillschweigend falsch lag
    await page.getByRole('button', { name: 'Carla' }).click();
    // Landet auf Carlas persönlichem Link …
    await page.waitForURL(new RegExp(`/f/${FAMN}/u/[a-z0-9]{4,}`));
    const carla = store.members.find(m => m.name === 'Carla');
    expect(carla.admin).toBe(true);
    expect(page.url()).toContain('/u/' + carla.url_slug);
    // … die anderen sind KEINE Admins
    expect(store.members.filter(m => m.admin)).toHaveLength(1);
    // Onboarding läuft als ERSTELLER weiter: sichern → Mitglieder einladen
    await expect(page.locator('#onboardSheet h2')).toHaveText('Zugriff sichern');
    await expect(page.locator('#obNext')).toHaveText('Weiter: Mitglieder einladen');
    await page.locator('#obNext').click();
    await expect(page.locator('#shareSheet')).toBeVisible();
    await expect(page.locator('#shareSheet .savenote')).toContainText('Admin: Carla');
    // Als Admin darf sie sofort für alle eintragen (Chips frei)
    await page.locator('#shareSheet .x').click();
    await expect(page.locator('.iam .chip')).toHaveCount(3);
  });

  test('Ersteinrichtung solo (v4.57.0): keine Frage — Person wird Admin und landet direkt auf ihrem Link', async ({ context, page }) => {
    const FAMN = 'neufam-solo7777';
    const store = { members: [], chores: [], families: [], log: [] };
    await context.route(`${SB}/rest/v1/**`, r => {
      const req = r.request();
      const table = ['members', 'chores', 'families', 'log', 'retired_families'].find(x => req.url().includes('/' + x)) || 'log';
      if (table === 'retired_families') return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      if (req.method() === 'POST') {
        [].concat(req.postDataJSON()).forEach(x => {
          const i = store[table].findIndex(y => y.id === x.id || (table === 'families' && y.family_id === x.family_id));
          if (i >= 0) store[table][i] = { ...store[table][i], ...x }; else store[table].push(x);
        });
        return r.fulfill({ status: 201, body: '' });
      }
      if (req.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(store[table] || []) });
      return r.fulfill({ status: 204, body: '' });
    });
    await blockExternal(context);
    await page.goto(`${BASE}/f/${FAMN}`);
    await page.locator('#frMembers').fill('Mira');
    await page.locator('#frSeed').uncheck();
    await page.locator('#frGo').click();
    await page.waitForURL(new RegExp(`/f/${FAMN}/u/[a-z0-9]{4,}`));
    expect(store.members).toHaveLength(1);
    expect(store.members[0].admin).toBe(true);
    await expect(page.locator('#onboardSheet h2')).toHaveText('Zugriff sichern');
  });

  test('Einstiegsseite (v4.58.0): übersetzt sich nach — englischer Browser sieht Englisch, Tipp-Eingabe wird nie verworfen', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'en-GB' });
    await mockBackend(ctx);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/`);
    // v4.58.1: die Haustür wird EINMAL gebaut, in der richtigen Sprache —
    // solange sie fehlt, steht der Splash. Es darf also NIE ein deutscher
    // Zwischenstand existieren.
    await expect(page.getByRole('button', { name: 'Create new household' })).toBeVisible();
    expect(await page.getByRole('button', { name: 'Neuen Haushalt erstellen' }).count()).toBe(0);
    await expect(page.getByText('Household chores – shared fairly.')).toBeVisible();
    await expect(page.locator('summary', { hasText: 'Diagnostics' })).toBeVisible();
    // Tippen im Beitreten-Feld übersteht jeden Neuaufbau
    await page.getByRole('button', { name: 'I have an invitation link' }).click();
    await page.locator('#joinLink').fill('f/testfam-abc123/u/slugmira1');
    await page.waitForTimeout(400);
    await expect(page.locator('#joinLink')).toHaveValue('f/testfam-abc123/u/slugmira1');
    await page.getByRole('button', { name: 'Join' }).click();
    await page.waitForURL(new RegExp('/f/testfam-abc123/u/slugmira1'));
    await ctx.close();
  });

  test('Pull ohne Neuigkeiten zeichnet NICHT neu — mit Neuigkeiten sehr wohl (v4.59.0)', async ({ context, page }) => {
    let extra = false;
    await mockBackend(context, { logRows: () => extra
      ? [ ...LOG, { id: 'l-neu', chore_id: 'c-1', chore_name: 'Müll rausbringen', member_id: 'm-mira', member_name: 'Mira', points: 1, done_at: new Date().toISOString(), family_id: FAM } ]
      : LOG });
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('.chore', { hasText: 'Müll rausbringen' })).toBeVisible();
    // DOM-Knoten markieren — überlebt er den Pull, wurde nicht neu gebaut
    await page.locator('.chore', { hasText: 'Müll rausbringen' }).evaluate(el => el.dataset.probe = 'alive');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));   // löst pull() aus
    await page.waitForTimeout(800);
    await expect(page.locator('[data-probe="alive"]')).toHaveCount(1);   // identischer Knoten: kein Redraw
    // Jetzt bringt der Server etwas Neues → Redraw MUSS passieren
    extra = true;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(800);
    await expect(page.locator('[data-probe="alive"]')).toHaveCount(0);   // Liste neu gebaut …
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry').first()).toBeVisible();          // … und die Neuigkeit ist da
  });

  test('Identität übernehmen (v4.60.0): blanker Link bietet «Wer bist du?» — Wahl macht Admin + persönlichen Link; «Später» merkt sich das Gerät', async ({ context, page }) => {
    const posts = [];
    await mockBackend(context, { memberRows: () => [
      { id: 'm-chris', name: 'Timon', color: '#2FAE6A', family_id: FAM, url_slug: 'slugchris1', admin: false },
      { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', admin: false },
      { id: 'm-cat', name: 'Tigi', color: '#B26500', family_id: FAM, url_slug: null, assisted: true },
    ] });
    await context.route(`${SB}/rest/v1/members*`, route => {
      const req = route.request();
      if (req.method() === 'POST') { posts.push(req.postDataJSON()); return route.fulfill({ status: 201, body: '' }); }
      return route.fallback();
    });
    await context.addInitScript(f => localStorage.removeItem('haushalt.claim:' + f), FAM);
    await page.goto(`${BASE}/f/${FAM}`);
    const sheet = page.locator('#claimSheet');
    await expect(sheet).toBeVisible();
    // Betreute stehen NICHT zur Wahl (eine Katze ist niemandes Identität)
    await expect(sheet.locator('[data-claim]')).toHaveCount(2);
    await expect(sheet.locator('button', { hasText: 'Tigi' })).toHaveCount(0);
    // «Später»: schliesst und setzt die Geräte-Marke (initScript entfernt sie
    // bei Navigationen — darum hier OHNE Reload prüfen, dass sie gesetzt wurde)
    await sheet.locator('#claimSkip').click();
    await expect(sheet).toBeHidden();
    expect(await page.evaluate(f => localStorage.getItem('haushalt.claim:' + f), FAM)).toBe('1');
    // Frisches Gerät: Wahl von Mira → Admin-POST + Umleitung auf ihren Link
    await page.reload();
    await expect(page.locator('#claimSheet')).toBeVisible();
    await page.locator('[data-claim="m-mira"]').click();
    await page.waitForURL(new RegExp(`/f/${FAM}/u/slugmira1`));
    const saved = [].concat(posts.flat()).find(r => r.id === 'm-mira');
    expect(saved.admin).toBe(true);
    // Auf dem persönlichen Link erscheint die Karte nie
    await expect(page.locator('#claimSheet')).toBeHidden();
  });

  test('Boot-Splash: Overlay räumt sich weg, Kopf-Logo erscheint, nichts blockiert (v4.39.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    // Overlay verschwindet nach dem Morph vollständig (Knoten entfernt)
    await expect(page.locator('#splash')).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/splash/);
    // Kopf-Logo sichtbar und voll deckend (html.splash-Regel aufgehoben)
    await expect(page.locator('#headLogo')).toBeVisible();
    await expect(page.locator('#headLogo')).toHaveCSS('opacity', '1');
    // Bedienung war nie blockiert — pointer-events:none ist die Garantie;
    // implizit decken das alle Tests ab, die direkt nach goto klicken.
  });

  test('Einladen-Sheet ist vollständig übersetzt (en) — kein deutsches Leck (v4.38.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('i18nInit')) {
        sessionStorage.setItem('i18nInit', '1');
        localStorage.setItem('haushalt.lang', 'en');
      }
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('#openShareTop').click();
    const sheet = page.locator('#shareSheet');
    await expect(sheet.locator('h2')).toHaveText('Invite');
    // Seit v4.55.0 kein Admin-Link-Block mehr — der Admin-Hinweis muss
    // trotzdem vollständig übersetzt sein (kein deutsches Leck)
    await expect(sheet.locator('.savenote')).toContainText('admin');
    await expect(sheet.locator('.savenote')).not.toContainText('Lesezeichen');
    await expect(sheet.locator('.subnote', { hasText: 'For friends' })).toBeVisible();
    // Empfehlen-Knopf im GLEICHEN Akzent-Blau wie alle Teilen-Knöpfe (kein ghost mehr)
    const bgRec = await sheet.locator('.shbtn[data-app]').evaluate(el => getComputedStyle(el).backgroundColor);
    const bgFirst = await sheet.locator('.shbtn').first().evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bgRec).toBe(bgFirst);
    await expect(sheet.locator('#doneShare')).toHaveText('Done');
    await expect(sheet.locator('.shbtn').first()).toHaveText('Invite');
    // Keine deutschen Reste im Sheet
    for (const de of ['Einladen', 'Admin-Link', 'Gibt vollen Zugriff', 'Fertig']) {
      await expect(sheet.getByText(de, { exact: true })).toHaveCount(0);
    }
  });

  test('Max. Punkte: Standard 5, Umschalten auf 3, Bestandswert schützt Skala (v4.35.0)', async ({ context, page }) => {
    await mockBackend(context, { memberRows: null });
    await context.route(`${SB}/rest/v1/chores**`, r => r.request().method() === 'GET'
      ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
          { id: 'c-1', name: 'Müll rausbringen', points: 2, note: null, family_id: FAM },
          { id: 'c-8', name: 'Blumen giessen', points: 8, note: null, family_id: FAM }]) })
      : r.fallback());
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('#openAdd').click();
    await expect(page.locator('#cPts')).toHaveAttribute('max', '5');   // Standard
    await page.locator('#cancelChore').click();
    await page.locator('#openSettings').click();
    await expect(page.locator('#setMaxPts .setval')).toHaveText('5');
    await page.locator('#setMaxPts').click();
    await page.locator('#maxPtsSheet [data-maxpts="3"]').click();
    await page.locator('#openAdd').click();
    await expect(page.locator('#cPts')).toHaveAttribute('max', '3');
    await page.locator('#cancelChore').click();
    // Kachel mit Bestandswert 8 editieren: Skala weicht nie unter den Wert
    await page.locator('.chore', { hasText: 'Blumen giessen' }).locator('[data-edit]').click();
    await expect(page.locator('#cPts')).toHaveAttribute('max', '8');
  });

  test('Personen-Chips brechen um — niemand wird seitlich abgeschnitten (v4.34.3)', async ({ context, page }) => {
    await mockBackend(context, { memberRows: () => ['Alessandra','Bartholomäus','Marianne','Dominique','Emmanuelle','Friedrich'].map((n, i) =>
      ({ id: 'm-' + i, family_id: FAM, name: n, color: '#B9A2E8' })) });
    await page.setViewportSize({ width: 393, height: 800 });
    await page.goto(`${BASE}/f/${FAM}`);
    const chips = page.locator('#iamRow .chip');
    await expect(chips).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      const box = await chips.nth(i).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(393 + 1);   // vollständig im Bild
    }
    // Mehrzeilig → zentriert (Klasse gesetzt)
    await expect(page.locator('#iamRow')).toHaveClass(/\bmulti\b/);
  });

  test('Was-ist-neu-Hinweis: Wiederkehrer sehen ihn einmal pro Version, Erstkontakt nie (v4.37.0)', async ({ context, page }) => {
    await mockBackend(context);
    // Wiederkehrer: alte Versionsmarke gesetzt
    await page.addInitScript(() => {
      // Einmal-Guard: initScripts laufen auch nach reload() — ohne Guard
      // wuerde die alte Marke den Dismiss wieder ueberschreiben (§10-Regel)
      if (!sessionStorage.getItem('t.seeded')) {
        sessionStorage.setItem('t.seeded', '1');
        localStorage.setItem('haushalt.seenver', '4.0.0');
      }
    });
    await page.goto(`${BASE}/f/${FAM}`);
    const bar = page.locator('#newsBar');
    await expect(bar).toBeVisible();
    await expect(page.locator('#newsBarLink')).toHaveAttribute('href', '/chores/updates.html');
    await page.locator('#newsBarClose').click();
    await expect(bar).toBeHidden();
    await page.reload();                                  // Dismiss persistiert
    await expect(page.locator('#newsBar')).toBeHidden();
  });

  test('Was-ist-neu-Hinweis: INHALTS-verankert — wer NEWS_VERSION gesehen hat, wird nie wieder gepingt (v4.43.1)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    const src = await page.evaluate(() => document.documentElement.innerHTML);
    const ver = src.match(/APP_VERSION = '([^']+)'/)[1];
    const news = src.match(/NEWS_VERSION = '([^']+)'/)[1];
    // 1) Stand >= NEWS_VERSION gesehen (aber != aktuell): KEIN Ping, egal wie
    //    viele Minor-/Patch-Releases seither — Marke wird still nachgezogen
    await page.evaluate(n => localStorage.setItem('haushalt.seenver', n), news);
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('#newsBar')).toBeHidden();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('haushalt.seenver'))).toBe(ver);
    // 2) Stand < NEWS_VERSION: der Inhalt von updates.html ist neu → Banner
    await page.evaluate(() => localStorage.setItem('haushalt.seenver', '4.0.0'));
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('#newsBar')).toBeVisible();
    // 3) Konsistenz-Wache: NEWS_VERSION darf nie vor dem liegen, was
    //    updates.html tatsächlich berichtet (sonst pingt der Banner auf
    //    Inhalte, die es nicht gibt)
    expect(parseFloat(news)).toBeLessThanOrEqual(parseFloat(ver));
  });

  test('Was-ist-neu-Hinweis: Erstkontakt sieht KEIN Banner, Marke wird still gesetzt (v4.37.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('#newsBar')).toBeHidden();
    const seen = await page.evaluate(() => localStorage.getItem('haushalt.seenver'));
    expect(seen).not.toBeNull();                          // still markiert
  });

  test('Geteilte Links (Einladen/Empfehlen/QR) zeigen den fairli-Alias; interne Navigation bleibt /chores/ (v4.36.4)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page).toHaveURL(new RegExp('/chores/f/' + FAM));   // App laeuft weiterhin unter /chores/
    await page.locator('#openShareTop').click();
    // v4.55.0: es gibt nur noch persönliche Links — auch sie tragen den Alias
    const memberBtn = page.locator('.shrow [data-share]').first();
    await expect(memberBtn).toHaveAttribute('data-share', new RegExp('^https?://[^/]+/fairli/f/' + FAM + '/u/'));
    const recommendBtn = page.locator('[data-share][data-app="1"]');
    await expect(recommendBtn).toHaveAttribute('data-share', /^https?:\/\/[^/]+\/fairli\/$/);
  });

  test('Personen-Chips: nie ein einzelner Chip auf der letzten Zeile (v4.36.1)', async ({ context, page }) => {
    await mockBackend(context, { memberRows: () => ['Amelie','Timon','Isabella','Mira','Noel'].map((n, i) =>
      ({ id: 'm-' + i, family_id: FAM, name: n, color: '#B9A2E8' })) });
    await page.setViewportSize({ width: 393, height: 800 });
    await page.goto(`${BASE}/f/${FAM}`);
    const chips = page.locator('#iamRow .chip');
    await expect(chips).toHaveCount(5);
    await page.waitForTimeout(150);   // rAF-Umbruch-Ausgleich abwarten
    const boxes = [];
    for (let i = 0; i < 5; i++) boxes.push(await chips.nth(i).boundingBox());
    const lines = {};
    for (const b of boxes) { const k = Math.round(b.y); (lines[k] = lines[k] || []).push(b); }
    const counts = Object.keys(lines).sort((a, b) => a - b).map(k => lines[k].length);
    expect(counts.length).toBeGreaterThan(1);                  // wirklich umgebrochen
    expect(counts[counts.length - 1]).toBeGreaterThanOrEqual(2);   // unten nie allein
  });

  test('Personen-Chips: einzeilige Familie bleibt linksbündig (v4.34.4)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('#iamRow .chip').first()).toBeVisible();
    await expect(page.locator('#iamRow')).not.toHaveClass(/\bmulti\b/);
  });

  test('Tastatur-Viewport: resizes-content gesetzt, Sheet scrollt im geschrumpften Viewport (v4.34.1)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    const meta = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(meta).toContain('interactive-widget=resizes-content');
    // Tastatur simulieren: Viewport auf Tastatur-Resthoehe schrumpfen
    await page.setViewportSize({ width: 393, height: 360 });
    await page.locator('#openAdd').click();
    const btn = page.locator('#saveChore');
    await btn.scrollIntoViewIfNeeded();
    await expect(btn).toBeVisible();          // Primaerknopf erreichbar
    const box = await btn.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(360 + 1);   // innerhalb des Viewports
  });

  test('Kachel-Kunst flackert nicht: Re-Render startet bekannte Bilder als .ok (v4.33.3)', async ({ context, page }) => {
    await mockBackend(context);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await context.route('**://gen.pollinations.ai/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('.chore[data-cid="c-1"] img.art')).toHaveClass(/\bok\b/);   // erstes Laden: onload
    // Re-Render erzwingen (Tab-Wechsel hin und zurueck baut das Grid neu)
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await page.getByRole('tab', { name: 'Aufgaben' }).click();
    // SOFORT (ohne auf onload zu warten): Bild ist bereits als ok gerendert
    const cls = await page.locator('.chore[data-cid="c-1"] img.art').getAttribute('class');
    expect(cls.split(/\s+/)).toContain('ok');
  });

  test('Valentin-Szenario: Probe-Cache «0», Wegweiser, Mittwoch-Cache → heilt sich zur famc-Familie (v4.36.2)', async ({ context, page }) => {
    const FAMP = 'fam-frozen01';
    await context.route('**://fonts.googleapis.com/**', r => r.abort());
    await context.route('**://fonts.gstatic.com/**', r => r.abort());
    await context.route('**://gen.pollinations.ai/**', r => r.abort());
    await suppressOnboarding(context);
    await context.route(`${SB}/rest/v1/**`, r => {
      const req = r.request(); const url = new URL(req.url());
      const table = url.pathname.split('/').pop();
      const famEq = (url.searchParams.get('family_id') || '').replace('eq.', '');
      if (req.method() !== 'GET') return r.fulfill({ status: 201, body: '' });
      const enc = famEq.startsWith('famc-');
      const data = enc ? {
        families: [{ family_id: famEq, name: 'Fanti WG', write_key_hash: 'a'.repeat(64) }],
        members: [{ id: 'm-j', family_id: famEq, name: 'Mira', color: '#B9A2E8', url_slug: null }],
        chores: [{ id: 'c-n', family_id: famEq, name: 'Wäsche NEU', points: 1, note: null }],
        log: [{ id: 'l-n', family_id: famEq, chore_id: 'c-n', chore_name: 'Wäsche NEU', chore_note: null,
                member_id: 'm-j', member_name: 'Mira', points: 1, done_at: new Date().toISOString(),
                created_at: new Date().toISOString(), updated_at: null }]
      } : {
        families: [{ family_id: FAMP, name: '→ App aktualisieren / update app', write_key_hash: null }],
        members: [], chores: [], log: []
      };
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data[table] || []) });
    });
    await page.addInitScript(fam => {
      if (sessionStorage.getItem('boot1-injected')) return;    // nur Boot 1 praeparieren
      sessionStorage.setItem('boot1-injected', '1');
      localStorage.setItem('haushalt.encv:' + fam, '0');          // verpasste Migration
      localStorage.setItem('haushalt.v2:' + fam, JSON.stringify({ // Mittwoch-Cache
        famName: 'Fanti WG',
        members: [{ id: 'mx', name: 'Isabella', color: '#B8860B' }],
        chores: [], log: [{ id: 'lx', chore_id: null, chore_name: 'Wäsche ALT', member_id: 'mx',
          member_name: 'Isabella', points: 3, done_at: '2026-07-15T18:55:00Z' }]
      }));
    }, FAMP);
    await page.goto(`${BASE}/f/${FAMP}`);
    // Selbstheilung: Re-Probe → Reload → famc-Daten sichtbar
    await expect(page.locator('.chore', { hasText: 'Wäsche NEU' })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.chip', { hasText: 'Mira' })).toBeVisible();
    expect(await page.evaluate(f => localStorage.getItem('haushalt.encv:' + f), FAMP)).toBe('1');
  });

  test('Nach Migration: Client mit leeren Alt-Zeilen lädt NICHTS hoch (keine Klartext-Auferstehung, v4.33.1)', async ({ context, page }) => {
    let uploads = 0;
    await context.route('**://fonts.googleapis.com/**', r => r.abort());
    await context.route('**://fonts.gstatic.com/**', r => r.abort());
    await context.route('**://gen.pollinations.ai/**', r => r.abort());
    await suppressOnboarding(context);
    await context.route(`${SB}/rest/v1/**`, r => {
      const req = r.request(); const url = new URL(req.url());
      const table = url.pathname.split('/').pop();
      const famEq = (url.searchParams.get('family_id') || '').replace('eq.', '');
      if (req.method() === 'POST' && !famEq.startsWith('famc-')) uploads++;
      if (req.method() === 'GET') {
        // migrierter Zustand: Alt-Zeilen leer, families-Zeile = Wegweiser
        const body = table === 'families' && !famEq.startsWith('famc-')
          ? [{ family_id: famEq, name: '→ App aktualisieren / update app' }] : [];
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      }
      return r.fulfill({ status: 201, body: '' });
    });
    // Geraet hat lokalen Klartext-Stand + Probe-Cache '0' (verpasste Migration)
    await page.addInitScript(fam => {
      localStorage.setItem('haushalt.v2:' + fam, JSON.stringify({
        famName: 'Fanti WG',
        members: [{ id: 'm1', name: 'Mira', color: '#B9A2E8' }],
        chores: [{ id: 'c1', name: 'Müll rausbringen', points: 2 }], log: []
      }));
      localStorage.setItem('haushalt.encv:' + fam, '0');
    }, 'fam-migrated1');
    await page.goto(`${BASE}/f/fam-migrated1`);   // Boot + Re-Probe-Reload abwarten
    expect(uploads).toBe(0);           // KEINE Klartext-Auferstehung
  });

  test('Verifiziertes Löschen: DELETE scheitert zweimal → Kachel kehrt zurück, ehrlicher Toast (v4.33.0)', async ({ context, page }) => {
    await mockBackend(context);
    let delAttempts = 0;
    await context.route(`${SB}/rest/v1/chores?id=eq.c-1**`, r => {
      if (r.request().method() === 'DELETE') { delAttempts++; return r.fulfill({ status: 500, body: '' }); }
      return r.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('.chore[data-cid="c-1"] [data-edit]').click();
    page.once('dialog', d => d.accept());
    await page.locator('#deleteChore').click();
    // optimistisch weg …
    await expect(page.locator('.chore[data-cid="c-1"]')).toHaveCount(0);
    // … aber nach 2 Fehlversuchen ehrlich wiederhergestellt
    await expect(page.locator('.chore[data-cid="c-1"]')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#toast')).toContainText('wiederhergestellt');
    expect(delAttempts).toBe(2);
  });

  test('Duplikat-Hinweis beim Anlegen: gleicher Name → «gibt es schon» + Stattdessen verbuchen (v4.33.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('.chip', { hasText: 'Mira' }).click();
    await page.locator('#openAdd').click();
    await page.locator('#cName').fill('müll rausbringen');   // case-insensitiv
    await expect(page.locator('#dupHint')).toBeVisible();
    await expect(page.locator('#dupHintText')).toContainText('gibt es schon');
    await page.locator('#dupRecord').click();
    await expect(page.locator('#choreSheet')).not.toBeVisible();
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry', { hasText: 'Müll rausbringen' }).first()).toBeVisible();  // auf BESTEHENDER Kachel verbucht (neuester zuerst)
    // und: keine zweite Kachel entstanden
    await page.getByRole('tab', { name: 'Aufgaben' }).click();
    expect(await page.locator('.chore .cname', { hasText: 'Müll rausbringen' }).count()).toBe(1);
  });

  test('Sortierung: Standard «Nach Erstellung» stabil, Umschalten auf Alphabetisch ordnet um und persistiert (v4.33.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    // Neue Kachel: kein Pin — landet in «Nach Erstellung» HINTEN, mit Flash
    await page.locator('.chip', { hasText: 'Mira' }).click();
    await page.locator('#openAdd').click();
    await page.locator('#cName').fill('Aaa Ganz Neu');
    await page.locator('#saveChore').click();
    const cids = await page.locator('.chore[data-cid] .cname').allTextContents();
    expect(cids[cids.length - 1]).toBe('Aaa Ganz Neu');   // trotz Alpha-erstem Namen: hinten (Erstellzeit!)
    // Einstellungen zeigen den Standard
    await page.locator('#openSettings').click();
    await expect(page.locator('#setSort .setval')).toHaveText('Nach Erstellung');
    await page.locator('#setSort').click();
    await page.locator('#sortSheet [data-sort="alpha"]').click();
    // Alphabetische Reihenfolge der Kachelnamen prüfen
    const names = await page.locator('.chore[data-cid] .cname').allTextContents();
    const sorted = names.slice().sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
    expect(names).toEqual(sorted);
    await page.reload();
    await page.locator('#openSettings').click();
    await expect(page.locator('#setSort .setval')).toHaveText('Alphabetisch');   // persistiert
  });

  test('Punkte-Ansicht rendert: Balken, Krone, Zähler — nie wieder t-Shadowing (v4.32.0)', async ({ context, page }) => {
    await mockBackend(context, { logRows: () => [
      { id: 'l-a', family_id: FAM, chore_id: 'c-1', chore_name: 'Müll rausbringen', member_id: 'm-mira', member_name: 'Mira', points: 2, done_at: new Date().toISOString() }
    ] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await expect(page.locator('.score').first()).toBeVisible();      // v4.27–v4.31: leer («t is not a function»)
    await expect(page.locator('.period button[data-p="week"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.score .bar i').first()).toBeVisible();
    await expect(page.locator('.score', { hasText: 'Mira' }).locator('.sub')).toContainText('1 Aufgabe erledigt');
    await page.locator('.period button[data-p="all"]').click();
    await expect(page.locator('.period button[data-p="all"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Verlauf: Tages-Köpfe «Heute»/«Gestern», Zeilen zeigen nur Zeit (v4.32.0)', async ({ context, page }) => {
    const now = new Date(); const yest = new Date(now); yest.setDate(now.getDate() - 1);
    await mockBackend(context, { logRows: () => [
      { id: 'l-t', family_id: FAM, chore_id: 'c-1', chore_name: 'Müll rausbringen', member_id: 'm-mira', member_name: 'Mira', points: 2, done_at: now.toISOString() },
      { id: 'l-y', family_id: FAM, chore_id: 'c-1', chore_name: 'Müll rausbringen', member_id: 'm-mira', member_name: 'Mira', points: 2, done_at: yest.toISOString() }
    ] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.dayhead').nth(0)).toHaveText('Heute');
    await expect(page.locator('.dayhead').nth(1)).toHaveText('Gestern');
    await expect(page.locator('.entry .when').first()).toHaveText(/^\d{2}:\d{2}$/);   // nur Zeit
  });

  test('i18n: Sprachwechsel DE→EN übersetzt Statik und Dynamik, persistiert (v4.27.0)', async ({ context, page }) => {
    await mockBackend(context);
    const en = readFileSync(join(__i18nDir, 'en.json'), 'utf8');
    await context.route('**/i18n/en.json**', r => r.fulfill({ status: 200, contentType: 'application/json', body: en }));
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.getByRole('tab', { name: 'Aufgaben' })).toBeVisible();   // startet Deutsch (locale de-CH)
    await page.locator('#openSettings').click();
    await page.locator('#setLang').click();
    await page.locator('#langSheet [data-lang="en"]').click();
    await expect(page.getByRole('tab', { name: 'Tasks' })).toBeVisible();      // Statik übersetzt
    await expect(page.locator('#openShareTop')).toHaveText('Invite');
    await expect(page.locator('#oneOffTile .cname')).toHaveText('One-off');    // Dynamik übersetzt
    await page.locator('#openAdd').click();
    await expect(page.locator('#saveChore')).toHaveText('Save + log');
    await page.locator('#cancelChore').click();
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Tasks' })).toBeVisible();      // Wahl persistiert
    await page.locator('#openSettings').click();
    await page.locator('#setLang').click();
    await page.locator('#langSheet [data-lang="de"]').click();
    await expect(page.getByRole('tab', { name: 'Aufgaben' })).toBeVisible();   // Rückweg
  });

  test('i18n: Wörterbuch-Integrität ALLER Sprachen — gleiche Schlüssel, Platzhalter identisch, nie leer (v4.28.0)', async ({}) => {
    const { readdirSync } = await import('fs');
    const files = readdirSync(__i18nDir).filter(f => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(6);
    const tokens = s => (s.match(/\{(\w+)\}/g) || []).sort().join(',');
    const ref = Object.keys(JSON.parse(readFileSync(join(__i18nDir, 'en.json'), 'utf8'))).sort();
    for (const f of files) {
      const dict = JSON.parse(readFileSync(join(__i18nDir, f), 'utf8'));
      expect(Object.keys(dict).sort(), `${f}: Schlüsselmenge`).toEqual(ref);
      for (const [k, v] of Object.entries(dict)) {
        expect(v.trim().length, `${f} leer: ${k}`).toBeGreaterThan(0);
        expect(tokens(v), `${f} Platzhalter: ${k}`).toBe(tokens(k));
      }
    }
  });

  test('Verschlüsselung: famx-Familie sendet NIE Klartext, DB-Schlüssel ist Hash, Roundtrip rendert korrekt (v4.30.0)', async ({ context, page }) => {
    test.setTimeout(30000);
    const FAMX = 'famx-testsecret1234';
    await context.route('**://fonts.googleapis.com/**', r => r.abort());
    await context.route('**://fonts.gstatic.com/**', r => r.abort());
    await context.route('**://gen.pollinations.ai/**', r => r.abort());
    const store = { members: [], chores: [], log: [], families: [] };
    let sawPlain = false, sawHashKey = null, sawKeyless = false, sawNoHash = false;
    await suppressOnboarding(context);
    await context.route(`${SB}/rest/v1/**`, async r => {
      const req = r.request(); const url = new URL(req.url());
      const table = url.pathname.split('/').pop();
      const famEq = (url.searchParams.get('family_id') || '').replace('eq.', '');
      if (famEq) sawHashKey = famEq;
      const body = req.postData() || '';
      if (body.includes('testsecret') || /"name"\s*:\s*"(Ich|Blumen)/.test(body)) sawPlain = true;
      if (req.method() === 'POST') {
        if (!req.headers()['x-fairli-key']) sawKeyless = true;         // v4.36: famx schreibt NIE ohne Key
        const rows = JSON.parse(body);
        (Array.isArray(rows) ? rows : [rows]).forEach(x => {
          if (!store[table]) return;
          if (table === 'families' && !/^[0-9a-f]{64}$/.test(x.write_key_hash || '')) sawNoHash = true;
          const i = store[table].findIndex(y => y.id === x.id || (table === 'families' && y.family_id === x.family_id));
          if (i >= 0) store[table][i] = x; else store[table].push(x);   // merge-duplicates wie Supabase
        });
        return r.fulfill({ status: 201, body: '' });
      }
      if (req.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(store[table] || []) });
      return r.fulfill({ status: 204, body: '' });
    });
    await page.goto(`${BASE}/f/${FAMX}`);
    // Ersteinrichtung: Namen eintragen und bestätigen
    await page.locator('#frName').fill('Krypto WG');
    await page.locator('#frMembers').fill('Timon');
    await page.locator('#frSeed').uncheck();
    await page.locator('#frGo').click();
    // Nach dem Setup: Schritt 1 «Zugriff sichern» (v4.45.0) → Weiter → Einladen-Sheet
    await expect(page.locator('#onboardSheet h2')).toHaveText('Zugriff sichern');
    await page.locator('#obNext').click();
    await expect(page.locator('#shareSheet')).toBeVisible();
    await page.locator('#shareSheet .x').click();
    await expect(page.locator('.chip', { hasText: 'Timon' })).toBeVisible();
    // Aufgabe anlegen und verbuchen (Primärweg schreibt chores + log)
    await page.locator('.chip', { hasText: 'Timon' }).click();
    await page.locator('#openAdd').click();
    await page.locator('#cName').fill('Blumen giessen');
    await page.locator('#saveChore').click();
    await expect(page.locator('.chore', { hasText: 'Blumen giessen' })).toBeVisible();
    await page.waitForTimeout(600);   // fire-and-forget-Pushes landen lassen
    // 1) Kein Klartext hat den Client je verlassen
    expect(sawPlain).toBe(false);
    // 2) DB-Schlüssel ist der Hash, nie das Geheimnis
    expect(sawHashKey).toMatch(/^famx-[0-9a-f]{48}$/);
    expect(sawHashKey).not.toContain('testsecret');
    expect(sawKeyless).toBe(false);           // v4.36: Write-Key-Header immer dabei
    expect(sawNoHash).toBe(false);            // families-Zeile traegt write_key_hash
    // 3) Gespeicherte Werte sind Chiffrat
    const anyName = (store.members[0] || {}).name || '';
    expect(anyName.startsWith('enc1:')).toBe(true);
    // 4) Roundtrip: frischer Client (leerer localStorage) liest NUR den Server
    await context.clearCookies();
    const page2 = await context.newPage();
    await page2.goto(`${BASE}/f/${FAMX}`);
    await page2.evaluate(() => localStorage.clear());
    await page2.reload();
    // Frischer Client auf bestehender Familie = Erstbesuch → «Zugriff
    // sichern» erscheint (v4.45.0, gewollt) — bestätigen und weiter
    await expect(page2.locator('#onboardSheet h2')).toHaveText('Zugriff sichern');
    await page2.locator('#obNext').click();
    await expect(page2.locator('.chore', { hasText: 'Blumen giessen' })).toBeVisible();
    await expect(page2.locator('.chip', { hasText: 'Timon' })).toBeVisible();
    // Verschluesselte Familie: Einstellungen zeigen KEINE Verschluesselungs-Zeile (v4.34.0)
    await page2.locator('#openSettings').click();
    await expect(page2.locator('#settingsSheet')).toBeVisible();
    expect(await page2.locator('#setEnc').count()).toBe(0);
  });

  test('Einstellungen: Sprache, Verschlüsselungs-Status, Version, Select-all (v4.31.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('#openSettings').click();
    const sh = page.locator('#settingsSheet');
    await expect(sh.getByRole('heading', { name: 'Einstellungen' })).toBeVisible();
    await expect(sh.locator('#setLang .setval')).toHaveText('Deutsch');
    await expect(sh.locator('#setEnc .setval')).toHaveText('Aus');   // fam- Familie, Admin
    await expect(sh.getByText(/Fairli 4\./)).toBeVisible();
    await sh.locator('#setLang').click();
    await expect(page.locator('#langSheet')).toBeVisible();
    await page.locator('#closeLang').click();
    // Select-all beim Fokussieren: Bearbeiten-Feld ist vorbefüllt → markiert
    // Select-all: Eintrag verbuchen, im Verlauf ZEILE antippen (v4.31),
    // vorbefülltes Titel-Feld fokussieren — Tippen ERSETZT den Inhalt
    await page.locator('.chip', { hasText: 'Mira' }).click();
    await page.locator('.chore', { hasText: 'Müll rausbringen' }).click();
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await page.locator('button.entry').first().click();
    await expect(page.locator('#logSheet')).toBeVisible();
    await page.locator('#lName').focus();
    await page.waitForTimeout(80);   // rAF des Select-all-Handlers
    await page.keyboard.type('X');
    await expect(page.locator('#lName')).toHaveValue('X');
  });

  test('Migration: fam- → verschlüsselt, GLEICHE URL — Kopie, Verifikation, Klartext weg, Roundtrip (v4.31.0)', async ({ context, page }) => {
    test.setTimeout(40000);
    await context.route('**://fonts.googleapis.com/**', r => r.abort());
    await context.route('**://fonts.gstatic.com/**', r => r.abort());
    await context.route('**://gen.pollinations.ai/**', r => r.abort());
    const plainStore = {
      families: [{ family_id: FAM, name: 'Fanti WG' }],
      members: [{ id: 'm-mira', family_id: FAM, name: 'Mira', color: '#B9A2E8', url_slug: 'slugmira1' }],
      chores: [{ id: 'c-1', family_id: FAM, name: 'Müll rausbringen', points: 2, note: null }],
      log: [{ id: 'l-1', family_id: FAM, chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: null,
              member_id: 'm-mira', member_name: 'Mira', points: 2, done_at: '2026-07-10T10:00:00Z' }]
    };
    const encStore = { families: [], members: [], chores: [], log: [] };
    const tombstones = [];
    let plainDeleted = [];
    await suppressOnboarding(context);
    await context.route(`${SB}/rest/v1/**`, async r => {
      const req = r.request(); const url = new URL(req.url());
      const table = url.pathname.split('/').pop();
      const famEq = (url.searchParams.get('family_id') || '').replace('eq.', '');
      if (table === 'retired_families') {
        if (req.method() === 'POST') tombstones.push(JSON.parse(req.postData()).family_id);
        return r.fulfill({ status: 201, body: '' });
      }
      const enc = famEq.startsWith('famc-');
      const store = enc ? encStore : plainStore;
      if (req.method() === 'POST') {
        const rows = JSON.parse(req.postData());
        (Array.isArray(rows) ? rows : [rows]).forEach(x => {
          // Unbekannte Tabellen (z. B. devices, v4.88.0) tolerant anlegen —
          // der Migrations-Vertrag handelt von families/members/chores/log.
          store[table] = store[table] || [];
          const i = store[table].findIndex(y => y.id === x.id || (table === 'families' && y.family_id === x.family_id));
          if (i >= 0) store[table][i] = x; else store[table].push(x);
        });
        return r.fulfill({ status: 201, body: '' });
      }
      if (req.method() === 'DELETE') { plainDeleted.push(table); store[table] = []; return r.fulfill({ status: 204, body: '' }); }
      if (req.method() === 'PATCH') {
        const b = JSON.parse(req.postData()); (store[table] || []).forEach(x => Object.assign(x, b));
        return r.fulfill({ status: 204, body: '' });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(store[table] || []) });
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('.chore', { hasText: 'Müll rausbringen' })).toBeVisible();
    await page.locator('#openSettings').click();
    await page.locator('#setEnc').click();
    const mig = page.locator('#migrateSheet');
    await mig.locator('#migGo').click();
    // «Fertig» abwarten — waitForURL auf dieselbe URL löst sofort aus (Falle!)
    await expect(mig.locator('#migStatus')).toContainText('Fertig', { timeout: 15000 });
    // Grabstein traegt die ALTE Klartext-ID (nicht den famc-Hash)
    expect(tombstones).toEqual([FAM]);
    // Verschlüsselte Kopie existiert, Klartext ist weg
    expect(encStore.members.length).toBe(1);
    expect(encStore.members[0].name.startsWith('enc1:')).toBe(true);
    expect(encStore.members[0].family_id).toMatch(/^famc-[0-9a-f]{48}$/);
    expect(plainDeleted).toEqual(expect.arrayContaining(['log', 'chores', 'members']));
    expect(plainStore.members.length).toBe(0);
    expect(plainStore.families[0].name).toContain('App aktualisieren');   // Wegweiser für alte Clients
    // Roundtrip: gleiche URL, frischer Zustand → Daten aus der famc-Kopie
    await page.evaluate(() => { const k = 'haushalt.encv:' + location.pathname.match(/f\/([a-z0-9-]+)/i)[1]; const l = localStorage.getItem(k); localStorage.clear(); localStorage.setItem(k, l); });
    await page.reload();
    await expect(page.locator('.chore', { hasText: 'Müll rausbringen' })).toBeVisible();
    await expect(page.locator('.chip', { hasText: 'Mira' })).toBeVisible();
  });

  test('Notiz erscheint auf Kachel und im Verlauf (Snapshot, v4.9.0/v4.11.1)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('.chore .cnote', { hasText: 'nur Restmüll' })).toBeVisible();
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry .enote', { hasText: 'nur Restmüll' })).toBeVisible();
  });

  test('Install-Anleitung iOS: Chrome erlaubt, «Teilen» nur noch fürs iOS-Sheet, Symbole vorhanden (v4.20.1/v4.21.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    // Verwechslungsschutz an der Wurzel (v4.21.0): die App selbst nennt nichts
    // mehr «Teilen» — Knopf oben und Sheet heissen «Einladen», App-Link «Empfehlen».
    await expect(page.locator('#openShareTop')).toHaveText('Einladen');
    await page.locator('#openShareTop').click();
    const sheet = page.locator('#shareSheet');
    await expect(sheet.locator('h2')).toHaveText('Einladen');
    expect(await sheet.locator('.shbtn', { hasText: 'Teilen' }).count()).toBe(0);
    const inst = sheet.locator('details.install');
    await inst.locator('summary').click();
    const ios = inst.locator('.plat').first();
    const txt = await ios.innerText();
    // Seit iOS 16.4 installieren Safari UND Chrome über das System-Share-Sheet.
    expect(txt).toContain('Chrome');
    expect(txt).not.toContain('nicht in Chrome');
    // «Teilen» in der Anleitung meint jetzt eindeutig Apples Share-Sheet.
    expect(txt).toContain('«Teilen»');
    // Beide Piktogramme (Share-Pfeil, Plus-im-Quadrat) sind eingebettet.
    expect(await ios.locator('svg.ic').count()).toBeGreaterThanOrEqual(2);
  });


  // ---------- v4.61.0: Der eingefrorene Leser (Live-Vorfall 19.–21.07.) ----------

  test('Wasserzeichen-Ratsche: Tipp während des Pulls verwirft den Snapshot, aber die Zeilen kommen WIEDER (v4.61.0)', async ({ context, page }) => {
    // Vorher: das Wasserzeichen wanderte VOR dem Stale-Guard — ein Tipp
    // während eines laufenden Pulls machte die gerade geholten Server-Zeilen
    // dauerhaft unsichtbar (bis zum 24-h-Voll-Abgleich, den dasselbe Rennen
    // ebenfalls schlucken konnte). Genau so «verschwanden» die Einträge
    // anderer Familienmitglieder ab So 19.07. abends.
    const MIRAROW = { id: 'l-mira', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: '',
      member_id: 'm-mira', member_name: 'Mira', points: 2, done_at: '2026-07-20T18:48:40+00:00',
      created_at: '2026-07-20T18:48:39.222222+00:00', updated_at: null, family_id: FAM };
    const OLDROW = { id: 'l-old', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: '',
      member_id: 'm-chris', member_name: 'Timon', points: 2, done_at: '2026-07-19T16:58:35+00:00',
      created_at: '2026-07-19T16:58:35+00:00', updated_at: null, family_id: FAM };
    let holdLog = null;
    await context.route('**://fonts.googleapis.com/**', r => r.abort());
    await context.route('**://gen.pollinations.ai/**', r => r.abort());
    await context.route(`${SB}/rest/v1/**`, async route => {
      const req = route.request();
      const u = new URL(req.url());
      const famEq = (u.searchParams.get('family_id') || '').replace('eq.', '');
      if (famEq && famEq !== FAM) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      if (req.method() !== 'GET') return route.fulfill({ status: 204, body: '' });
      if (u.pathname.includes('/log')) {
        const q = decodeURIComponent(u.search);
        const m = q.match(/or=\(created_at\.gt\.([^,]+),updated_at\.gt\./);
        const all = [MIRAROW, OLDROW];
        const rows = m ? all.filter(r => (r.created_at && r.created_at > m[1]) || (r.updated_at && r.updated_at > m[1])) : all;
        if (holdLog) { const h = holdLog; holdLog = null; await h; }   // Antwort festhalten, bis der Tipp passiert ist
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
      }
      const body = u.pathname.includes('/members') ? MEMBERS : u.pathname.includes('/chores') ? CHORES : u.pathname.includes('/families') ? FAMILIES : [];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await context.addInitScript(({ fam, ver }) => {
      localStorage.setItem('haushalt.onboard:' + fam + ':a', '1');
      localStorage.setItem('haushalt.onboard:' + fam + ':u', '1');
      localStorage.setItem('haushalt.claim:' + fam, '1');
      // Geräte-Zustand: Sonntag-Schnappschuss + Sonntag-Wasserzeichen + frischer Voll-Marker
      localStorage.setItem('haushalt.v2:' + fam, JSON.stringify({
        members: [{ id: 'm-chris', name: 'Timon', color: '#2FAE6A', url_slug: 'slugchris1', admin: true }],
        chores: [{ id: 'c-1', name: 'Müll rausbringen', points: 2, note: '' }],
        log: [{ id: 'l-old', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: '', member_id: 'm-chris', member_name: 'Timon', points: 2, done_at: '2026-07-19T16:58:35+00:00', created_at: '2026-07-19T16:58:35+00:00', updated_at: null }],
        famName: 'Testhaushalt' }));
      localStorage.setItem('haushalt.delta:' + fam, '2026-07-19T17:00:00+00:00');
      localStorage.setItem('haushalt.full:' + fam, String(Date.now() - 3600e3));
      // Versions-Marke = LIVE-Version setzen, sonst erzwingt der
      // Versionswechsel den Voll-Abgleich und der Delta-Pfad (den dieser
      // Test prüft) läuft nie
      localStorage.setItem('haushalt.pullver:' + fam, ver);
    }, { fam: FAM, ver: APP_VERSION });
    let release; holdLog = new Promise(r => release = r);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(900);                       // Pull läuft, Log-Antwort hängt
    await page.locator('.chip', { hasText: 'Timon' }).click();
    await page.locator('button.chore[data-cid="c-1"]').click();   // Tipp WÄHREND des Pulls
    release();                                            // jetzt trifft die Log-Antwort ein
    await page.waitForTimeout(700);
    // Der Snapshot wurde verworfen — aber das Wasserzeichen darf NICHT über
    // Miras Zeile hinausgewandert sein:
    const wm = await page.evaluate(fam => localStorage.getItem('haushalt.delta:' + fam), FAM);
    expect(wm < '2026-07-20').toBeTruthy();
    // Nächster (ungestörter) Pull bringt die Zeile wirklich:
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(800);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('#list')).toContainText('Mira');
  });

  test('Versionswechsel erzwingt EINEN Voll-Abgleich — Selbstheilung vergifteter Wasserzeichen (v4.61.0)', async ({ context, page }) => {
    // Gerät mit einem Wasserzeichen, das (durch die alte Ratsche) bereits an
    // unsichtbaren Zeilen VORBEI steht: nach dem App-Update muss ein
    // Voll-Abgleich die Zeilen zurückbringen, obwohl das Delta sie nie sähe.
    const HIDDEN = { id: 'l-hidden', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: '',
      member_id: 'm-mira', member_name: 'Mira', points: 2, done_at: '2026-07-20T12:00:00+00:00',
      created_at: '2026-07-20T12:00:00+00:00', updated_at: null, family_id: FAM };
    await mockBackend(context, { logRows: () => [HIDDEN, ...LOG] });
    await context.addInitScript(fam => {
      localStorage.setItem('haushalt.v2:' + fam, JSON.stringify({
        members: [], chores: [],
        log: [{ id: 'l-1', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: 'nur Restmüll', member_id: 'm-mira', member_name: 'Mira', points: 2, done_at: '2026-07-10T10:00:00Z' }],
        famName: 'Testhaushalt' }));
      // Wasserzeichen steht BEREITS HINTER der versteckten Zeile — Delta fände sie nie
      localStorage.setItem('haushalt.delta:' + fam, '2026-07-21T00:00:00+00:00');
      localStorage.setItem('haushalt.full:' + fam, String(Date.now() - 3600e3));
      localStorage.setItem('haushalt.pullver:' + fam, '4.60.0');   // ALTE Version → Marke passt nicht
    }, FAM);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('#list')).toContainText('Mira');     // Voll-Abgleich hat sie geholt
    const ver = await page.evaluate(fam => localStorage.getItem('haushalt.pullver:' + fam), FAM);
    expect(ver).toBe(APP_VERSION);                                 // Marke fortgeschrieben
  });

  test('Identität übernehmen: Angebot am blanken Link, Erfolg → persönlicher Link mit Admin (v4.61.0)', async ({ context, page }) => {
    let upserted = null;
    await context.addInitScript(() => { try { sessionStorage.setItem('fairli.claimPersona.off', '1'); } catch {} });
    await mockBackend(context, { memberRows: () => [
      { id: 'm-chris', name: 'Timon', color: '#2FAE6A', family_id: FAM, url_slug: null, admin: null },
      { id: 'm-mira',  name: 'Mira',  color: '#3E6BD6', family_id: FAM, url_slug: null, admin: null },
    ] });
    await context.route(`${SB}/rest/v1/members**`, route => {
      const req = route.request();
      if (req.method() === 'POST') { upserted = JSON.parse(req.postData() || '[]'); return route.fulfill({ status: 204, body: '' }); }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('#claimSheet')).toBeVisible();       // Angebot nach erstem Pull
    await Promise.all([
      page.waitForURL(/\/u\//),
      page.locator('#claimSheet [data-claim="m-chris"]').click(),
    ]);
    // Server hat Slug + Admin gelernt, BEVOR navigiert wurde
    const row = Array.isArray(upserted) ? upserted[0] : upserted;
    expect(row.id).toBe('m-chris');
    expect(row.admin).toBe(true);
    expect(String(row.url_slug || '').length).toBeGreaterThan(8);
    expect(page.url()).toContain('/u/' + row.url_slug);
  });

  test('Identität übernehmen: Upsert scheitert → KEINE Umleitung, keine Aussperrung (v4.61.0)', async ({ context, page }) => {
    // Vorher schluckte ein catch{} den Fehler und navigierte trotzdem zu einem
    // Slug, den der Server nie erfuhr → «Link ungültig», Gerät ausgesperrt.
    await context.addInitScript(() => { try { sessionStorage.setItem('fairli.claimPersona.off', '1'); } catch {} });
    await mockBackend(context, { memberRows: () => [
      { id: 'm-chris', name: 'Timon', color: '#2FAE6A', family_id: FAM, url_slug: null, admin: null },
    ] });
    await context.route(`${SB}/rest/v1/members**`, route =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, body: 'kaputt' })
        : route.fallback());
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('#claimSheet')).toBeVisible();
    await page.locator('#claimSheet [data-claim="m-chris"]').click();
    await page.waitForTimeout(800);
    expect(page.url()).not.toContain('/u/');                       // am Familien-Link geblieben
    await expect(page.locator('#toast')).toContainText('keine Verbindung');
    // Gerät bleibt voll benutzbar — und beim Neuladen KEIN «Link ungültig»
    await page.reload();
    await page.waitForTimeout(700);
    expect(await page.locator('body').innerText()).not.toContain('Link ungültig');
  });

  test('Identitäts-Angebot: Backdrop-Schließen zählt als «Später» — kein erneutes Nerven (v4.61.0)', async ({ context, page }) => {
    await context.addInitScript(() => { try { sessionStorage.setItem('fairli.claimPersona.off', '1'); } catch {} });
    await mockBackend(context, { memberRows: () => [
      { id: 'm-chris', name: 'Timon', color: '#2FAE6A', family_id: FAM, url_slug: null, admin: null },
    ] });
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('#claimSheet')).toBeVisible();
    // ECHTER Backdrop-Tipp (Klick auf das dialog-Element selbst) — markiert
    // synchron; .close() liesse das close-Event gegen den Reload verlieren
    await page.evaluate(() => document.getElementById('claimSheet')
      .dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.reload();
    await page.waitForTimeout(900);
    await expect(page.locator('#claimSheet')).toBeHidden();        // Marke gesetzt, Ruhe
  });

  test('Personen-Chips kleben oben: nach Scrollen bleiben Auswahl UND Tabs erreichbar (v4.62.0)', async ({ context, page }) => {
    // Viele Log-Zeilen erzwingen eine lange Seite; nach Scroll ans Ende
    // muessen Chips (Personenwahl) und Tabs im Viewport bleiben.
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: 'l-' + i, chore_id: null, chore_name: 'Aufgabe ' + i, chore_note: '',
      member_id: i % 2 ? 'm-mira' : 'm-chris', member_name: i % 2 ? 'Mira' : 'Timon', points: 2,
      done_at: new Date(Date.now() - i * 26 * 3600e3).toISOString(),   // ~1 Eintrag/Tag, 60 Tages-Koepfe
      created_at: new Date(Date.now() - i * 26 * 3600e3).toISOString(), family_id: FAM }));
    await mockBackend(context, { logRows: () => many });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('#list .entry').first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(250);
    const iam = await page.locator('#iamRow').boundingBox();
    const tabs = await page.locator('.tabs').boundingBox();
    expect(iam).not.toBeNull();
    expect(iam.y).toBeGreaterThanOrEqual(0);        // im Viewport, oben
    expect(iam.y).toBeLessThan(120);
    expect(tabs.y).toBeGreaterThanOrEqual(iam.y);   // Tabs direkt darunter
    await expect(page.locator('.chip').first()).toBeVisible();
    // Chips bleiben BEDIENBAR: Tipp auf einen Chip waehlt die Person
    await page.locator('.chip', { hasText: 'Mira' }).click();
  });

  // ---------- v4.63.0: Papierkorb — Löschen ist ein Grabstein ----------

  test('Löschen sendet GRABSTEIN-Upsert (deleted_at), niemals DELETE — Eintrag wandert in den Papierkorb (v4.63.0)', async ({ context, page }) => {
    let sawDelete = false, tombstone = null;
    await mockBackend(context);
    await context.route(`${SB}/rest/v1/log**`, route => {
      const req = route.request();
      if (req.method() === 'DELETE') { sawDelete = true; return route.fulfill({ status: 204, body: '' }); }
      if (req.method() === 'POST') {
        const rows = JSON.parse(req.postData() || '[]');
        const t = (Array.isArray(rows) ? rows : [rows]).find(r => r.deleted_at);
        if (t) tombstone = t;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await page.locator('#list .entry').first().click();          // Bearbeiten-Sheet
    await page.locator('#delLog').click();                       // Löschen (Undo-Fenster 5 s)
    await expect(page.locator('#list .entry')).toHaveCount(0);   // lokal sofort weg
    await page.waitForTimeout(5600);                             // Fenster verstreicht → Commit
    expect(sawDelete).toBe(false);
    expect(tombstone).not.toBeNull();
    expect(tombstone.deleted_at).toBeTruthy();
    // Papierkorb in den Einstellungen zaehlt und listet den Eintrag
    await page.locator('#openSettings').click();
    await expect(page.locator('#setTrash .setval')).toHaveText('1');
    await page.locator('#setTrash').click();
    await expect(page.locator('#trashSheet .entry')).toHaveCount(1);
    await expect(page.locator('#trashSheet')).toContainText('Mira');
  });

  test('Grabstein vom Server entfernt den Eintrag auf ANDEREN Geräten im Delta — keine 24-h-Geister mehr (v4.63.0)', async ({ context, page }) => {
    // Gerät B hat den Eintrag lokal; ein Delta-Pull bringt denselben Eintrag
    // als Grabstein (anderes Gerät hat gelöscht) → Verlauf zeigt ihn nicht mehr.
    const ROW = { id: 'l-1', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: '',
      member_id: 'm-mira', member_name: 'Mira', points: 2,
      done_at: '2026-07-21T10:00:00+00:00', created_at: '2026-07-21T10:00:01+00:00',
      updated_at: null, deleted_at: null, deleted_by: null, family_id: FAM };
    const TOMB = Object.assign({}, ROW, { deleted_at: '2026-07-21T12:00:00+00:00',
      deleted_by: 'm-chris', updated_at: '2026-07-21T12:00:00.5+00:00' });
    await mockBackend(context, { logRows: () => [TOMB] });
    await context.addInitScript(({ fam, row, ver }) => {
      localStorage.setItem('haushalt.onboard:' + fam + ':a', '1');
      localStorage.setItem('haushalt.onboard:' + fam + ':u', '1');
      localStorage.setItem('haushalt.claim:' + fam, '1');
      localStorage.setItem('haushalt.v2:' + fam, JSON.stringify({
        members: [{ id: 'm-mira', name: 'Mira', color: '#3E6BD6' }],
        chores: [], log: [row], famName: 'Testhaushalt' }));
      localStorage.setItem('haushalt.delta:' + fam, '2026-07-21T11:00:00+00:00');
      localStorage.setItem('haushalt.full:' + fam, String(Date.now() - 3600e3));
      localStorage.setItem('haushalt.pullver:' + fam, ver);
    }, { fam: FAM, row: ROW, ver: APP_VERSION });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('#list')).not.toContainText('Müll rausbringen');
    // und er liegt im Papierkorb, mit Loeschendem
    await page.locator('#openSettings').click();
    await page.locator('#setTrash').click();
    await expect(page.locator('#trashSheet .entry')).toHaveCount(1);
  });

  test('Papierkorb: Wiederherstellen setzt deleted_at=null zurück, Eintrag kehrt in Verlauf und Punkte zurück (v4.63.0)', async ({ context, page }) => {
    let restored = null;
    const TOMB = { id: 'l-1', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: '',
      member_id: 'm-mira', member_name: 'Mira', points: 2,
      done_at: new Date().toISOString(), created_at: new Date().toISOString(),
      updated_at: null, deleted_at: new Date().toISOString(), deleted_by: 'm-chris', family_id: FAM };
    await mockBackend(context, { logRows: () => [TOMB] });
    await context.route(`${SB}/rest/v1/log**`, route => {
      const req = route.request();
      if (req.method() === 'POST') {
        const rows = JSON.parse(req.postData() || '[]');
        const r = (Array.isArray(rows) ? rows : [rows])[0];
        if (r && r.deleted_at === null) restored = r;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('#list')).not.toContainText('Müll rausbringen');
    await page.locator('#openSettings').click();
    await page.locator('#setTrash').click();
    await page.locator('#trashSheet [data-restore]').click();
    await page.evaluate(() => document.getElementById('trashSheet').close());
    expect(restored).not.toBeNull();
    expect(restored.deleted_at).toBeNull();
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('#list')).toContainText('Müll rausbringen');
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await expect(page.locator('#list')).toContainText('Mira');
  });

  test('Papierkorb-Rechte: persönlicher Nicht-Admin-Link sieht nur EIGENE gelöschte Einträge (v4.63.0)', async ({ context, page }) => {
    const mk = (id, mid, mname) => ({ id, chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: '',
      member_id: mid, member_name: mname, points: 2,
      done_at: new Date().toISOString(), created_at: new Date().toISOString(),
      updated_at: null, deleted_at: new Date().toISOString(), deleted_by: mid, family_id: FAM });
    await mockBackend(context, { logRows: () => [mk('l-mine', 'm-mira', 'Mira'), mk('l-other', 'm-chris', 'Timon')] });
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);            // Miras persönlicher Link (kein Admin)
    await page.locator('#openSettings').click();
    await expect(page.locator('#setTrash .setval')).toHaveText('1');
    await page.locator('#setTrash').click();
    await expect(page.locator('#trashSheet .entry')).toHaveCount(1);
    await expect(page.locator('#trashSheet')).toContainText('Mira');
    await expect(page.locator('#trashSheet')).not.toContainText('Timon');
  });

  test('Punkte ignorieren Grabsteine (v4.63.0)', async ({ context, page }) => {
    const live = { id: 'l-live', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: '',
      member_id: 'm-mira', member_name: 'Mira', points: 2,
      done_at: new Date().toISOString(), created_at: new Date().toISOString(), family_id: FAM };
    const dead = Object.assign({}, live, { id: 'l-dead', points: 90, deleted_at: new Date().toISOString() });
    await mockBackend(context, { logRows: () => [live, dead] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await expect(page.locator('#list .score .num').first()).toHaveText('2');   // nicht 92
  });

  test('Papierkorb-Ablauf: Grabstein älter als 30 Tage wird am Admin-Link endgültig entfernt (v4.63.0)', async ({ context, page }) => {
    let deleted = [];
    const old = { id: 'l-old', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: '',
      member_id: 'm-mira', member_name: 'Mira', points: 2,
      done_at: '2026-06-01T10:00:00+00:00', created_at: '2026-06-01T10:00:00+00:00',
      deleted_at: new Date(Date.now() - 31 * 86400e3).toISOString(), deleted_by: null, family_id: FAM };
    const fresh = Object.assign({}, old, { id: 'l-fresh', deleted_at: new Date(Date.now() - 2 * 86400e3).toISOString() });
    await mockBackend(context, { logRows: () => [old, fresh] });
    await context.route(`${SB}/rest/v1/log**`, route => {
      const req = route.request();
      if (req.method() === 'DELETE') {
        deleted.push(new URL(req.url()).search);
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);                        // Familien-Link = Admin
    await page.waitForTimeout(1200);                            // purge läuft nach dem Pull
    expect(deleted.some(q => q.includes('l-old'))).toBe(true);
    expect(deleted.some(q => q.includes('l-fresh'))).toBe(false);
    await page.locator('#openSettings').click();
    await expect(page.locator('#setTrash .setval')).toHaveText('1');   // nur der frische bleibt
  });

  // ---------- v4.64.0: Verlauf nach Person filtern ----------

  test('Punkte-Karte antippen öffnet den Verlauf GEFILTERT auf die Person, Pill zeigt und löst den Filter (v4.64.0)', async ({ context, page }) => {
    const mk = (id, mid, mname, chore) => ({ id, chore_id: null, chore_name: chore, chore_note: '',
      member_id: mid, member_name: mname, points: 2,
      done_at: new Date(Date.now() - Math.random() * 5 * 3600e3).toISOString(),
      created_at: new Date().toISOString(), family_id: FAM });
    await mockBackend(context, { logRows: () => [
      mk('l-1', 'm-mira', 'Mira', 'Staubsaugen'),
      mk('l-2', 'm-chris', 'Timon', 'Kochen'),
      mk('l-3', 'm-mira', 'Mira', 'Einkaufen'),
    ] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await page.locator('.score[data-mid="m-mira"]').click();
    // Verlauf-Tab ist aktiv, nur Miras Einträge sichtbar
    await expect(page.getByRole('tab', { name: 'Verlauf' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#list')).toContainText('Staubsaugen');
    await expect(page.locator('#list')).toContainText('Einkaufen');
    await expect(page.locator('#list')).not.toContainText('Kochen');
    // Pill zeigt den Filter und löst ihn
    await expect(page.locator('.filterpill')).toContainText('Mira');
    await page.locator('#clearLogFilter').click();
    await expect(page.locator('.filterpill')).toHaveCount(0);
    await expect(page.locator('#list')).toContainText('Kochen');
  });

  test('Personen-Filter: leerer Verlauf zeigt personenbezogene Leermeldung; Tab-Wechsel behält den Filter sichtbar (v4.64.0)', async ({ context, page }) => {
    const only = { id: 'l-1', chore_id: null, chore_name: 'Kochen', chore_note: '',
      member_id: 'm-chris', member_name: 'Timon', points: 2,
      done_at: new Date().toISOString(), created_at: new Date().toISOString(), family_id: FAM };
    await mockBackend(context, { logRows: () => [only] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await page.locator('.score[data-mid="m-mira"]').click();      // Mira hat nichts
    await expect(page.locator('#list .empty')).toContainText('Mira');
    // Wechsel weg und zurück: Filter besteht, ist aber durch die Pill offensichtlich
    await page.getByRole('tab', { name: 'Aufgaben' }).click();
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.filterpill')).toContainText('Mira');
  });

  // ---------- v4.73.0 (Beta): Geheimnis raus aus der Adressleiste ----------

  // Das Strippen haengt an der PLATTFORM, nicht am Testprojekt: auf iOS bleibt
  // die URL stehen (§6.2, Web-Clip backt die aktuelle URL ein). Diese Tests
  // stellen die UA deshalb SELBST, sonst behaupten sie auf dem iPhone-Projekt
  // das Gegenteil von dem, was dort gilt — und ein leckender Kontext reisst
  // Folgetests mit (real passiert: «Target page has been closed» drei Tests
  // spaeter). Darum eigener Kontext, und Aufraeumen im finally.
  const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
  const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
    + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  // v4.75.0: Das Strippen braucht die ausdrueckliche Zustimmung des Nutzers.
  async function linkSafe(ctx) {
    await ctx.addInitScript(f => { try { localStorage.setItem('haushalt.linksafe:' + f, '1'); } catch {} }, FAM);
  }
  async function withUA(browser, userAgent, fn) {
    const ctx = await browser.newContext({ userAgent });
    try {
      return await fn(ctx);
    } finally {
      // Der Abbau darf den Test nicht faellen. Am 27.07. stuerzte WebKit im
      // Sandbox-Container WAEHREND ctx.close() ab (MESA/EGL ohne GPU, dann
      // «WebKit encountered an internal error») — 20 s Timeout, Test rot,
      // obwohl JEDE Zusicherung vorher durchgelaufen war. Der Kontext ist an
      // dieser Stelle Wegwerfware; ein Fehler beim Wegwerfen ist Infrastruktur,
      // kein Befund. NUR der Abbau ist abgeschirmt, nie der Testkoerper.
      try { await ctx.close(); } catch {}
    }
  }

  test('Beta (Android/Desktop): nach dem ersten Abgleich steht das Familien-Geheimnis NICHT mehr in der URL (v4.73.0)', async ({ browser }) => {
    // link = auth: die URL ist ein Zugang auf Dauer-Anzeige — Screenshot,
    // «Tab teilen», Verlauf, Chronik-Sync. Route liegt in localStorage,
    // die App laeuft ohne URL weiter (Homescreen-Pfad).
    await withUA(browser, UA_ANDROID, async ctx => {
      await mockBackend(ctx, { famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }] });
      await linkSafe(ctx);                       // v4.75.0: nur MIT Zustimmung
      const page = await ctx.newPage();
      await page.goto(`${BASE}/f/${FAM}`);
      await expect.poll(() => page.url()).not.toContain(FAM);
      expect(page.url()).toMatch(/\/chores\/?$/);
      // … und die App funktioniert unveraendert weiter
      await expect(page.locator('.chip', { hasText: 'Mira' })).toBeVisible();
      await page.getByRole('tab', { name: 'Punkte' }).click();
      await expect(page.locator('.score').first()).toBeVisible();
      // Reload: der Boot restauriert die Route aus localStorage — und darf
      // das Geheimnis dabei NICHT zurueckschreiben. Erste Fassung tat genau
      // das; die URL war ab dem Reload wieder vollstaendig, bis der naechste
      // Abgleich sie erneut strippte. Also SOFORT nach dem Reload pruefen,
      // nicht erst wenn die App fertig ist.
      await page.reload();
      expect(page.url()).not.toContain(FAM);
      await expect(page.locator('.chip', { hasText: 'Mira' })).toBeVisible();
      expect(page.url()).not.toContain(FAM);
      // … und ein zweiter Reload ebenso (die Marke ist persistent)
      await page.reload();
      expect(page.url()).not.toContain(FAM);
      await expect(page.locator('.chip', { hasText: 'Mira' })).toBeVisible();
    });
  });

  test('Persoenlicher Link: das Geheimnis verschwindet AUCH dort — es steht vor dem /u/-Teil (v4.73.0)', async ({ browser }) => {
    // §12: der persoenliche Link traegt das Familien-Geheimnis. Wer /u/<slug>
    // abschneidet, hat den Familien-Link — persoenliche Links waren nie eine
    // Eindaemmung. Also gleiche Behandlung.
    await withUA(browser, UA_ANDROID, async ctx => {
      await mockBackend(ctx, { famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }] });
      await linkSafe(ctx);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
      await expect.poll(() => page.url()).not.toContain(FAM);
      expect(page.url()).not.toContain('slugmira1');
      await expect(page.locator('.chip', { hasText: 'Mira' })).toBeVisible();
    });
  });

  test('Aufraeumen gilt fuer ALLE Haushalte: auch ohne Beta strippt die Zustimmung (v4.77.0)', async ({ browser }) => {
    // v4.73.0 versprach «ohne Beta unveraendert»; seit v4.77.0 ist die
    // ZUSTIMMUNG das Gate. Ohne sie unveraendert (Test v4.75.0), mit ihr
    // gestrippt — Beta spielt keine Rolle mehr.
    await withUA(browser, UA_ANDROID, async ctx => {
      await mockBackend(ctx, { famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: null }] });
      await linkSafe(ctx);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/f/${FAM}`);
      await expect.poll(() => page.url()).not.toContain(FAM);
      await expect(page.locator('.chip', { hasText: 'Mira' })).toBeVisible();
    });
  });

  test('iOS: die URL bleibt stehen, auch MIT Beta — der Web-Clip backt sie ein (v4.73.0)', async ({ browser }) => {
    // §6.2: ohne Manifest nimmt der iOS-Web-Clip die AKTUELLE URL. Gestrippt
    // zeigte das Symbol auf BASE und haenge allein an localStorage — auf der
    // Plattform, die Storage bei Platzdruck raeumt.
    await withUA(browser, UA_IPHONE, async ctx => {
      await mockBackend(ctx, { famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }] });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/f/${FAM}`);
      await expect(page.locator('.chip', { hasText: 'Mira' })).toBeVisible();
      await page.waitForTimeout(700);
      expect(page.url()).toContain(FAM);
      // v4.77.0: die Einstellungs-Zeile fehlt auf iOS — ein Schalter, der
      // nichts bewirken kann, ist ein gebrochenes Versprechen (§11-Frage).
      await page.locator('#openSettings').click();
      await expect(page.locator('#setStripUrl')).toHaveCount(0);
    });
  });

  // Was die Geraete-Abnahme fuer v4.73.0 eigentlich prueft, laesst sich hier
  // entscheiden — der Emulator waere nur der Umweg. Die Installation haengt
  // AUSSCHLIESSLICH am Manifest, und dessen start_url kommt aus den Routen-
  // VARIABLEN, nie aus location.href. Also: nach dem Strippen nachsehen.
  test('Nach dem Strippen ist das Familien-Manifest unveraendert — der WebAPK-Start haengt nicht an der URL (v4.73.0)', async ({ browser }) => {
    await withUA(browser, UA_ANDROID, async ctx => {
      await mockBackend(ctx, { famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }] });
      await linkSafe(ctx);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/f/${FAM}`);
      await expect.poll(() => page.url()).not.toContain(FAM);      // gestrippt
      const href = await page.getAttribute('link[rel="manifest"]', 'href');
      expect(href).toContain('/chores/manifest.json');
      // Der Familien-WebAPK startet SEIT JEHER generisch (/chores/index.html)
      // und findet den Haushalt ueber loadRoute() — genau der Pfad, den das
      // Homescreen-Symbol schon immer geht. Das Strippen aendert daran nichts.
      const man = await page.evaluate(async u => (await (await fetch(u)).json()), href);
      expect(man.start_url).not.toContain(FAM);
      expect(man.scope).toContain('/chores/');
    });
  });

  test('Nach dem Strippen traegt das PERSOENLICHE Manifest weiter Familie und Slug (v4.73.0)', async ({ browser }) => {
    // Der persoenliche start_url wird aus FAMILY/USER_SLUG gebaut (der SW
    // macht daraus /chores/f/<fam>/u/<slug>), nicht aus der Adressleiste.
    await withUA(browser, UA_ANDROID, async ctx => {
      await mockBackend(ctx, { famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }] });
      await linkSafe(ctx);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
      await expect.poll(() => page.url()).not.toContain(FAM);      // gestrippt
      const href = await page.getAttribute('link[rel="manifest"]', 'href');
      expect(href).toContain('manifest.json?');
      expect(decodeURIComponent(href)).toContain('f=' + FAM);
      expect(decodeURIComponent(href)).toContain('u=slugmira1');
    });
  });

  test('Symbol-Start simuliert: blanke /chores/ mit gespeicherter Route findet den Haushalt und bleibt gestrippt (v4.73.0)', async ({ browser }) => {
    // Das ist der Installations-Pfad in Reinform: der WebAPK oeffnet den
    // generischen start_url, die Route kommt aus localStorage. Genau das
    // wuerde die Emulator-Abnahme beobachten.
    await withUA(browser, UA_ANDROID, async ctx => {
      await mockBackend(ctx, { famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }] });
      await linkSafe(ctx);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/f/${FAM}`);                 // einmal regulaer oeffnen …
      await expect.poll(() => page.url()).not.toContain(FAM);
      await page.goto(`${BASE}/`);                         // … dann wie das Symbol starten
      await expect(page.locator('.chip', { hasText: 'Mira' })).toBeVisible();
      expect(page.url()).not.toContain(FAM);
      const href = await page.getAttribute('link[rel="manifest"]', 'href');
      expect(href).toContain('/chores/manifest.json');     // installierbar bleibt es auch
    });
  });

  test('OHNE Zustimmung bleibt der Link stehen — die Adressleiste ist fuer viele die einzige Sicherung (v4.75.0)', async ({ browser }) => {
    // Kern der Aenderung: die App nimmt niemandem ungefragt eine
    // Sicherungskopie weg. family_id = SHA-256(Geheimnis) — ist der Link
    // ueberall weg, kann auch der Server ihn nicht zurueckgeben.
    await withUA(browser, UA_ANDROID, async ctx => {
      await mockBackend(ctx, { famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }] });
      const page = await ctx.newPage();                      // KEIN linkSafe()
      await page.goto(`${BASE}/f/${FAM}`);
      await expect(page.locator('.chip', { hasText: 'Mira' })).toBeVisible();
      await page.waitForTimeout(700);
      expect(page.url()).toContain(FAM);
    });
  });

  test('Zustimmen und widerrufen: der Schalter raeumt auf und stellt den Link SOFORT wieder her (v4.75.0/v4.77.0)', async ({ browser }) => {
    await withUA(browser, UA_ANDROID, async ctx => {
      // beta:null — seit v4.77.0 sehen ALLE Haushalte die Zeile
      await mockBackend(ctx, { famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: null }],
        memberRows: () => [{ id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', admin: true, goal: null }] });
      const page = await ctx.newPage();
      page.on('dialog', d => d.accept());                    // die Rueckfrage bejahen
      await page.goto(`${BASE}/f/${FAM}`);
      await expect(page.locator('.chip', { hasText: 'Mira' })).toBeVisible();
      expect(page.url()).toContain(FAM);                     // vorher: Link steht da
      await page.locator('#openSettings').click();
      await expect(page.locator('#setStripUrl')).toContainText('Aus');
      await page.locator('#setStripUrl').click();
      await expect.poll(() => page.url()).not.toContain(FAM);   // aufgeraeumt
      // Widerruf: der Link muss SOFORT zurueck sein, nicht erst beim Neustart
      await page.locator('#openSettings').click();
      await expect(page.locator('#setStripUrl')).toContainText('An');
      await page.locator('#setStripUrl').click();
      await expect.poll(() => page.url()).toContain(FAM);
      // und er bleibt auch ueber einen Neustart hinweg sichtbar
      await page.reload();
      expect(page.url()).toContain(FAM);
    });
  });

  test('Rueckfrage abgelehnt = nichts passiert (v4.75.0)', async ({ browser }) => {
    await withUA(browser, UA_ANDROID, async ctx => {
      await mockBackend(ctx, { famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }],
        memberRows: () => [{ id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', admin: true, goal: null }] });
      const page = await ctx.newPage();
      page.on('dialog', d => d.dismiss());                   // ablehnen
      await page.goto(`${BASE}/f/${FAM}`);
      await expect(page.locator('.chip', { hasText: 'Mira' })).toBeVisible();
      await page.locator('#openSettings').click();
      await page.locator('#setStripUrl').click();
      await page.waitForTimeout(400);
      expect(page.url()).toContain(FAM);                     // unveraendert
    });
  });

  // ---------- v4.78.0: Kachelbild im Bearbeiten-Sheet und im Verlauf ----------

  test('Bearbeiten-Sheet zeigt das Kachelbild — und die Bild-Idee aktualisiert es (debounced) (v4.78.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('.chore', { hasText: 'Müll rausbringen' }).locator('.edit').click();
    const prev = page.locator('#cArtPrev');
    await expect(prev).toHaveAttribute('src', /gen\.pollinations\.ai/);
    await expect(prev).toHaveAttribute('src', /seed=/);
    const before = await prev.getAttribute('src');
    // v4.87.0: der Prompt-Wechsel ERZEUGT ein neues Bild (dauert Sekunden) —
    // das alte bleibt SICHTBAR stehen, bis das neue geladen ist. Die neue URL
    // antwortet hier verzoegert; solange sie unterwegs ist, muss src noch die
    // alte sein und der busy-Funke leuchten. Vorher sprang die Vorschau
    // sofort auf die neue URL um und war fuer die gesamte Generierungszeit
    // ein leerer Rahmen (Maintainer-Befund).
    const png1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    let releaseNew = null;
    await context.route('**://gen.pollinations.ai/**', async r => {
      if (decodeURIComponent(r.request().url()).includes('a red robot vacuum')) {
        await new Promise(res => { releaseNew = res; });        // «Generierung» haelt an
      }
      return r.fulfill({ status: 200, contentType: 'image/png', body: png1 });
    });
    // Idee tippen: das Bild folgt — nach der Debounce-Pause, nicht pro Taste
    await page.locator('#cArt').fill('a red robot vacuum');
    await page.waitForTimeout(400);
    expect(await prev.getAttribute('src')).toBe(before);        // noch nicht (Debounce) …
    await expect.poll(() => page.locator('#cArtPrevW').evaluate(el => el.classList.contains('busy')),
      { timeout: 4000 }).toBe(true);                            // … Generierung laeuft an
    expect(await prev.getAttribute('src')).toBe(before);        // ALTES Bild steht noch
    releaseNew();                                               // Generierung fertig
    await expect.poll(() => prev.getAttribute('src'), { timeout: 4000 })
      .toContain(encodeURIComponent('a red robot vacuum'));     // jetzt der Wechsel
    await expect.poll(() => page.locator('#cArtPrevW').evaluate(el => el.classList.contains('busy'))).toBe(false);
  });

  test('KEINE Bild-Vorschau beim Anlegen und bei Einmalig — ohne id gibt es keinen stabilen Seed (v4.78.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('#openAdd').click();                     // Neue Aufgabe
    await expect(page.locator('#cArtPrev')).toBeHidden();
    await page.locator('#cancelChore').click();
    await page.evaluate(() => document.getElementById('oneOffTile').click());   // Einmalig
    await expect(page.locator('#cArtPrev')).toBeHidden();
  });

  test('Verlauf traegt das Kachelbild — aber NUR solange die Kachel den Schnappschuss-Namen traegt (v4.78.0)', async ({ context, page }) => {
    const now = new Date().toISOString();
    const mk = (id, cid, cname, extra) => Object.assign({ id, chore_id: cid, chore_name: cname, chore_note: '',
      member_id: 'm-mira', member_name: 'Mira', points: 2, done_at: now, created_at: now, family_id: FAM }, extra);
    await mockBackend(context, { logRows: () => [
      mk('l-a', 'c-1', 'Müll rausbringen'),          // Kachel existiert, Name stimmt → Bild
      mk('l-b', null, 'Pizza holen'),                // Einmalig → kein Bild
      mk('l-c', 'c-1', 'Alter Kachelname'),          // Schnappschuss ≠ Kachel → KEIN Bild:
    ] });                                            // das neue Bild wuerde neben dem alten Text luegen (§3)
    // v4.92.0: Kachelbilder sind standardmaessig AUS — fuer diesen Snapshot-
    // Namens-Test explizit einschalten (die Snapshot-Regel selbst ist
    // unveraendert; nur der Default hat gewechselt).
    await page.addInitScript(() => { try { localStorage.setItem('haushalt.logart', '1'); } catch {} });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    const row = txt => page.locator('.entry', { hasText: txt });
    await expect(row('Müll rausbringen').first().locator('img.eart')).toHaveAttribute('src', /gen\.pollinations\.ai/);
    await expect(row('Pizza holen').locator('img.eart')).toHaveCount(0);
    await expect(row('Alter Kachelname').locator('img.eart')).toHaveCount(0);
  });

  test('Eintrag-bearbeiten traegt das Kachelbild ZENTRIERT — gleiche Schnappschuss-Regel, kein leerer Slot (v4.93.0)', async ({ context, page }) => {
    const now = new Date().toISOString();
    const mk = (id, cid, cname) => ({ id, chore_id: cid, chore_name: cname, chore_note: '',
      member_id: 'm-mira', member_name: 'Mira', points: 2, done_at: now, created_at: now, family_id: FAM });
    await mockBackend(context, { logRows: () => [
      mk('l-a', 'c-1', 'Müll rausbringen'),          // Kachel existiert, Name stimmt → Bild
      mk('l-b', null, 'Pizza holen'),                // Einmalig → KEIN Bild, KEIN Platzhalter
    ] });
    // v4.93.0: Kachelbilder sind standardmaessig AUS — die Snapshot-Regel im
    // Edit-Sheet gilt aber unabhaengig vom Listen-Schalter; explizit an, damit
    // das Preview-Bild da ist.
    await page.addInitScript(() => { try { localStorage.setItem('haushalt.logart', '1'); } catch {} });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await page.locator('.entry', { hasText: 'Müll rausbringen' }).first().click();
    await expect(page.locator('#logSheet #lArtPrev')).toHaveAttribute('src', /gen\.pollinations\.ai/);
    // v4.93.0: Preview im Bild-Seitenverhaeltnis (96×64 ≈ 3:2, NICHT quadratisch),
    // ZENTRIERT im Sheet, KEIN Overscan (Bild fuellt den Rahmen ohne Scale).
    const g = await page.locator('#lArtPrevW').evaluate(el => {
      const w = el.getBoundingClientRect();
      const sheet = el.closest('.sheet').getBoundingClientRect();
      const cs = getComputedStyle(el.querySelector('img'));
      return { ww: w.width, wh: w.height, wLeft: w.left - sheet.left, wRight: sheet.right - w.right,
               transform: cs.transform };
    });
    expect(g.ww).toBeGreaterThan(g.wh + 10);                 // breiter als hoch (kein Quadrat)
    expect(Math.abs(g.ww / g.wh - 1.5)).toBeLessThan(0.12);  // ~3:2
    expect(Math.abs(g.wLeft - g.wRight)).toBeLessThan(4);    // horizontal ZENTRIERT
    expect(g.transform === 'none' || g.transform === 'matrix(1, 0, 0, 1, 0, 0)').toBeTruthy();  // kein Overscan
    await page.locator('#closeLog').click();
    await page.locator('.entry', { hasText: 'Pizza holen' }).click();
    await expect(page.locator('#logSheet #lArtPrev')).toHaveCount(0);
  });

  test('Aufgabe-bearbeiten zeigt die Kachel in ECHTER Kachel-Groesse — volle Breite, gedimmt, Name + Punkte im Overlay (v4.94.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    // Aufgaben-Tab, Stift auf der Kachel öffnet das Bearbeiten-Sheet
    await page.getByRole('tab', { name: 'Aufgaben' }).click();
    await page.locator('[data-edit="c-1"]').first().click();
    await expect(page.locator('#choreSheet')).toBeVisible();
    const w = page.locator('#cArtPrevW');
    await expect(w).toBeVisible();
    // Bild da …
    await expect(page.locator('#cArtPrev')).toHaveAttribute('src', /gen\.pollinations\.ai/);
    const g = await w.evaluate(el => {
      const r = el.getBoundingClientRect();
      const sheet = el.closest('.sheet').getBoundingClientRect();
      return { ww: r.width, wh: r.height, fillsWidth: (r.width / sheet.width),
               op: getComputedStyle(el.querySelector('img')).opacity,
               name: el.querySelector('.tpName') && el.querySelector('.tpName').textContent,
               pts: el.querySelector('.tpPts') && el.querySelector('.tpPts').textContent };
    });
    expect(g.fillsWidth).toBeGreaterThan(0.9);               // volle Sheet-Breite (Kachel-Groesse)
    expect(g.ww).toBeGreaterThan(g.wh * 2);                  // Banner, deutlich breiter als hoch
    expect(parseFloat(g.op)).toBeLessThan(0.8);              // Bild GEDIMMT (wie die echte Kachel)
    expect(g.name).toBe('Müll rausbringen');                 // Name-Overlay = Aufgabenname
    expect(g.pts).toBe('+2');                                // Punkte-Overlay
    // Live: Name im Feld ändern → Overlay zieht sofort mit
    await page.locator('#cName').fill('Küche wischen');
    await expect(page.locator('#cArtPrevW .tpName')).toHaveText('Küche wischen');
    // Der Eintrag-Edit (logSheet) bleibt die kleine zentrierte Vorschau —
    // KEINE Kachel-Overlays dort (Negativ-Kontrolle gegen versehentliche
    // Wiederverwendung der Klassen).
    await expect(page.locator('#logSheet .tpName')).toHaveCount(0);
  });

  test('Kachelbilder im Verlauf: Standard AUS (Farbband), Einschalten pro Gerät, überlebt den Reload (v4.92.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    // v4.92.0: Standard ist AUS — Farbband-Zeile, KEIN Bild, kein Kreis
    await expect(page.locator('.entry .eartr')).toHaveCount(0);
    await expect(page.locator('.entry .edot')).toHaveCount(0);
    const band = page.locator('.entry.vrow .pband').first();
    await expect(band).toBeVisible();
    const bg = await band.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(62, 107, 214)');            // Mira = #3E6BD6 (Fixture)
    const hOff = await page.evaluate(() => document.querySelector('.entry.vrow').getBoundingClientRect().height);
    expect(hOff).toBeLessThan(90);                   // kompakt: Inhaltshoehe
    // Einstellungen → Kachelbilder AN
    await page.locator('#openSettings').click();
    await expect(page.locator('#setLogart .setval')).toHaveText('Aus');
    await page.locator('#setLogart').click();
    await expect(page.locator('#setLogart .setval')).toHaveText('An');
    await page.keyboard.press('Escape');
    // AN: Bild rechts in der Zeile — das Farbband bleibt (Basis-Layout)
    await expect(page.locator('.entry .eartr').first()).toBeVisible();
    await expect(page.locator('.entry.vrow .pband').first()).toBeVisible();
    await expect(page.locator('.entry .edot')).toHaveCount(0);
    // Pro Geraet, persistiert: Reload behaelt die Wahl
    await page.reload();
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry .eartr').first()).toBeVisible();
    // Und zurueck: AUS entfernt die Bilder wieder
    await page.locator('#openSettings').click();
    await page.locator('#setLogart').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('.entry .eartr')).toHaveCount(0);
    await expect(page.locator('.entry.vrow .pband').first()).toBeVisible();
  });

  test('Verlauf-Zeile: Farbband + fetter Name, EINE Schriftgroesse, alte Bild-links-Bausteine sind weg (v4.92.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    const row = page.locator('.entry', { hasText: 'Müll rausbringen' }).first();
    await expect(row.locator('.epname')).toHaveText('Mira');
    const fs = await row.locator('.epname').evaluate(el => getComputedStyle(el).fontSize);
    const fs2 = await row.locator('.ename').evaluate(el => getComputedStyle(el).fontSize);
    expect(fs).toBe(fs2);                                   // EINE Groesse (Maintainer 27.07.)
    // Die alten Bausteine existieren NIRGENDS mehr (geloescht, nicht versteckt):
    await expect(page.locator('.edot, .eartw, .eartph, .entry .dot, .entry .mchip')).toHaveCount(0);
    // Erstes Element der Zeile ist das Farbband
    const first = await row.evaluate(el => el.firstElementChild.className);
    expect(first).toContain('pband');
  });

  test('Verlauf-Ordnung v4.93.0: Bild RECHTS vor den Punkten, 90×60, KEIN Overscan, ohne Bild kein Slot', async ({ context, page }) => {
    // Maintainer-Spez 28.07.: Basis-Layout = Farbband-Zeile; Kachelbild (An)
    // sitzt RECHTS, direkt vor «+n». Crop v4.93.0: 90×60 (3:2), KEIN Overscan —
    // gemessen an 20 Live-Generierungen trug KEINE einen Rand, also nichts
    // wegzuschneiden; cover fuellt sauber.
    const now = new Date().toISOString();
    const mk = (id, cid, cname, note, off) => ({ id, chore_id: cid, chore_name: cname, chore_note: note,
      member_id: 'm-mira', member_name: 'Mira', points: 2,
      done_at: new Date(Date.now() - off).toISOString(), created_at: now, family_id: FAM });
    await mockBackend(context, { logRows: () => [
      mk('l-a', 'c-1', 'Müll rausbringen', 'nur Restmüll', 0),   // Bild + Notiz
      mk('l-b', null, 'Pizza holen', '', 3600e3),                // kein Bild (Einmalige)
    ] });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await context.route('**://gen.pollinations.ai/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
    // Kachelbilder AN (v4.92.0: Standard ist AUS)
    await page.addInitScript(() => { try { localStorage.setItem('haushalt.logart', '1'); } catch {} });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    const rows = page.locator('.entry.vrow');
    await expect(rows).toHaveCount(2);
    // Bild-Zeile: Kachel rechts, DIREKT vor den Punkten, vertikal zentriert
    const art = await rows.nth(0).locator('.eartr').boundingBox();
    const pts = await rows.nth(0).locator('.pts').boundingBox();
    const row0 = await rows.nth(0).boundingBox();
    expect(art.x + art.width).toBeLessThan(pts.x + 1);           // Bild VOR +n
    expect(pts.x - (art.x + art.width)).toBeLessThan(20);        // … und direkt davor
    const artMidY = art.y + art.height / 2, rowMidY = row0.y + row0.height / 2;
    expect(Math.abs(artMidY - rowMidY)).toBeLessThan(3);
    // Text steht LINKS vom Bild (Basis-Layout unveraendert)
    const txt = await rows.nth(0).locator('.eline1').boundingBox();
    expect(txt.x + txt.width).toBeLessThanOrEqual(art.x + 1);
    // Crop-Geometrie: Kachel 90×60 = 3:2 …
    expect(Math.abs(art.width / art.height - 1.5)).toBeLessThan(0.06);
    expect(art.width).toBeGreaterThan(80);                      // groesser als der alte 66px-Thumb
    // … und KEIN Overscan: das <img> fuellt die Kachel exakt (cover ohne
    // scale). Negativ-Kontrolle gegen ein wiederkehrendes transform:scale.
    const img = await rows.nth(0).locator('img.eart').boundingBox();
    expect(Math.abs(img.width - art.width)).toBeLessThan(5);   // nur die 1.5px-Kante, KEIN Overscan-Zoom (der waere +10..18px)
    const tf = await rows.nth(0).locator('img.eart').evaluate(el => getComputedStyle(el).transform);
    expect(tf === 'none' || tf === 'matrix(1, 0, 0, 1, 0, 0)').toBeTruthy();   // strikte Negativ-Kontrolle gegen scale()
    // v4.87.0: der Pastell-Rahmen bleibt auf der Kachel
    const bc = await rows.nth(0).locator('.eartr').evaluate(el => getComputedStyle(el).borderTopColor);
    expect(bc).toBe('rgba(240, 233, 220, 0.42)');
    // Zeile OHNE Bild: KEIN Slot, kein Platzhalter — die Punkte bleiben
    // trotzdem rechts verankert (gleiche rechte Kante in beiden Zeilen)
    await expect(rows.nth(1).locator('.eartr')).toHaveCount(0);
    await expect(rows.nth(1).locator('.eartph')).toHaveCount(0);
    const pts2 = await rows.nth(1).locator('.pts').boundingBox();
    expect(Math.abs((pts.x + pts.width) - (pts2.x + pts2.width))).toBeLessThan(1.5);
    // Beide Zeilen tragen das Farbband, Textspalte an derselben x-Koordinate
    await expect(rows.nth(0).locator('.pband')).toHaveCount(1);
    await expect(rows.nth(1).locator('.pband')).toHaveCount(1);
    const x1 = (await rows.nth(0).locator('.eline1').boundingBox()).x;
    const x2 = (await rows.nth(1).locator('.eline1').boundingBox()).x;
    expect(Math.abs(x1 - x2)).toBeLessThan(1);
  });

  // ---------- v4.76.0: «Wie das Geraet» ist die Standard-Sprachwahl ----------

  test('Sprache «Wie das Gerät»: ohne Wahl folgt die App dem Gerät — und die Liste sagt das ehrlich (v4.76.0)', async ({ browser }) => {
    // Englisches Geraet, keine gespeicherte Wahl: App startet Englisch, das
    // Haekchen sitzt bei «Wie das Geraet» — NICHT bei English, denn gewaehlt
    // hat der Nutzer nichts.
    const ctx = await browser.newContext({ locale: 'en-US' });
    try {
      await mockBackend(ctx);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/f/${FAM}`);
      await expect(page.getByRole('tab', { name: 'Tasks' })).toBeVisible();   // Geraetesprache wirkt
      await page.locator('#openSettings').click();
      await page.locator('#setLang').click();
      await expect(page.locator('#langAuto')).toContainText('✓');
      await expect(page.locator('#langAuto')).toContainText('English');      // zeigt, WAS das Geraet ist
      await expect(page.locator('#langSheet [data-lang="en"]')).not.toContainText('✓');
    } finally { try { await ctx.close(); } catch {} }
  });

  test('Sprache: explizite Wahl schlaegt das Gerät, «Wie das Gerät» fuehrt zurueck — auch ueber den Reload (v4.76.0)', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'en-US' });
    try {
      await mockBackend(ctx);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/f/${FAM}`);
      await expect(page.getByRole('tab', { name: 'Tasks' })).toBeVisible();
      // Deutsch waehlen: gilt sofort und uebersteht den Reload (englisches Geraet!)
      await page.locator('#openSettings').click();
      await page.locator('#setLang').click();
      await page.locator('#langSheet [data-lang="de"]').click();
      await expect(page.getByRole('tab', { name: 'Aufgaben' })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('tab', { name: 'Aufgaben' })).toBeVisible();
      await page.locator('#openSettings').click();
      await page.locator('#setLang').click();
      await expect(page.locator('#langSheet [data-lang="de"]')).toContainText('✓');
      await expect(page.locator('#langAuto')).not.toContainText('✓');
      // Zurueck zu «Wie das Geraet»: Wahl geloescht, Geraetesprache gilt wieder —
      // sofort UND nach dem Reload (vorher gab es diesen Rueckweg gar nicht).
      await page.locator('#langAuto').click();
      await expect(page.getByRole('tab', { name: 'Tasks' })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('tab', { name: 'Tasks' })).toBeVisible();
    } finally { try { await ctx.close(); } catch {} }
  });

  // ---------- v4.75.1: Release-Notes folgen der App-Sprache ----------

  test('Release-Notes: App auf Deutsch schlaegt englisches Telefon — und der Toggle gilt nur fuer den Besuch (v4.75.1)', async ({ browser }) => {
    // Live-Befund: Telefon-OS Englisch, App Deutsch → englische Notes. Die
    // Seite las nur navigator.language, nie die Einstellung der App.
    const ctx = await browser.newContext({ locale: 'en-US' });
    try {
      await blockExternal(ctx);
      await ctx.addInitScript(() => { try { localStorage.setItem('haushalt.lang', 'de'); } catch {} });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/updates.html`);
      await expect(page.locator('#lang-de')).toBeVisible();
      await expect(page.locator('#lang-en')).toBeHidden();
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      // Der Toggle funktioniert weiter …
      await page.locator('button#en').click();
      await expect(page.locator('#lang-en')).toBeVisible();
      // … gilt aber nur fuer diesen Besuch: beim naechsten Oeffnen gewinnt
      // wieder die App-Einstellung (die Einstellungen BESITZEN die Sprache).
      await page.reload();
      await expect(page.locator('#lang-de')).toBeVisible();
    } finally { try { await ctx.close(); } catch {} }
  });

  test('Release-Notes ohne App-Sprachwahl: Browsersprache entscheidet wie bisher (v4.75.1)', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'en-US' });
    try {
      await blockExternal(ctx);
      const page = await ctx.newPage();                     // KEIN haushalt.lang
      await page.goto(`${BASE}/updates.html`);
      await expect(page.locator('#lang-en')).toBeVisible();
      await expect(page.locator('#lang-de')).toBeHidden();
    } finally { try { await ctx.close(); } catch {} }
  });

  test('Release-Notes: dritte App-Sprache (fr) faellt auf Englisch zurueck, nicht auf Deutsch (v4.75.1)', async ({ browser }) => {
    // Die Notes gibt es nur in DE/EN. Fuer eine franzoesisch eingestellte App
    // ist Englisch die bessere Naeherung — Deutsch waere nur der Zufall der
    // Quellsprache.
    const ctx = await browser.newContext({ locale: 'de-CH' });   // Browser sagt de …
    try {
      await blockExternal(ctx);
      await ctx.addInitScript(() => { try { localStorage.setItem('haushalt.lang', 'fr'); } catch {} });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/updates.html`);
      await expect(page.locator('#lang-en')).toBeVisible();       // … die App-Wahl gewinnt
    } finally { try { await ctx.close(); } catch {} }
  });

  // ---------- v4.72.0: app_version je Eintrag (Schreib-Telemetrie) ----------

  test('Neuer Eintrag traegt die App-Version — im Klartext, nur beim ANLEGEN (v4.72.0)', async ({ context, page }) => {
    const posts = [];
    await mockBackend(context, { logRows: () => [] });
    await context.route(`${SB}/rest/v1/log**`, route => {
      if (route.request().method() === 'POST') {
        posts.push([].concat(route.request().postDataJSON()));
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.locator('.chip', { hasText: 'Mira' }).click();
    await page.locator('.chore', { hasText: 'Müll rausbringen' }).first().click();
    await expect.poll(() => posts.flat().length).toBeGreaterThan(0);
    const row = posts.flat()[0];
    expect(row.app_version).toMatch(/^\d+\.\d+\.\d+$/);
    // Nicht hartkodiert: es muss die Version sein, die der Client selbst traegt
    const shown = await page.evaluate(() =>
      (document.documentElement.innerHTML.match(/APP_VERSION = '([\d.]+)'/) || [])[1] || null);
    if (shown) expect(row.app_version).toBe(shown);
    // Klartext: eine Build-Nummer ist kein Personenbezug und nie enc1:
    expect(String(row.app_version).startsWith('enc1:')).toBe(false);
  });

  test('Die Version wandert NIE in die Pull-Spaltenliste — Schreib-Telemetrie kostet keinen Egress (v4.72.0)', async ({ context, page }) => {
    // Gegenstueck zu Regel C: die Spalte gehoert bewusst NICHT in LCOLS.
    // Ohne diesen Test traegt die naechste Session sie «regelkonform» nach.
    const selects = [];
    await mockBackend(context);
    await context.route(`${SB}/rest/v1/log**`, route => {
      if (route.request().method() === 'GET') {
        selects.push(new URL(route.request().url()).searchParams.get('select') || '');
      }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect.poll(() => selects.length).toBeGreaterThan(0);
    for (const s of selects) expect(s).not.toContain('app_version');
  });

  test('Bestandsschutz: Zeilen OHNE app_version rendern und synchronisieren unveraendert (v4.72.0)', async ({ context, page }) => {
    // Die Zusage an alle, die noch auf einer aelteren Fassung sitzen: ihre
    // Zeilen haben die Spalte nicht (NULL) — nichts im Client darf sie brauchen.
    const upserts = [];
    const old = { id: 'l-old', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: '',
      member_id: 'm-mira', member_name: 'Mira', points: 2,
      done_at: new Date().toISOString(), created_at: new Date().toISOString(), family_id: FAM };
    await mockBackend(context, { logRows: () => [old] });
    await context.route(`${SB}/rest/v1/log**`, route => {
      if (route.request().method() === 'POST') {
        upserts.push([].concat(route.request().postDataJSON()));
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry')).toHaveCount(1);          // rendert
    await expect(page.locator('.entry').first()).toContainText('Müll rausbringen');
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await expect(page.locator('.score', { hasText: 'Mira' })).toContainText('2');
    // 1-h-Zusammenlegung auf die GEPULLTE Zeile: die Version des Erzeugers
    // darf dabei weder gesetzt noch ueberschrieben werden.
    await page.getByRole('tab', { name: 'Aufgaben' }).click();
    await page.locator('.chip', { hasText: 'Mira' }).click();
    await page.locator('.chore', { hasText: 'Müll rausbringen' }).first().click();
    await expect.poll(() => upserts.flat().some(r => r.id === 'l-old')).toBe(true);
    const merged = upserts.flat().find(r => r.id === 'l-old');
    expect('app_version' in merged).toBe(false);      // Zusammenlegung fasst sie nicht an
    expect(merged.points).toBe(4);                    // … addiert aber wie bisher
  });

  // ---------- v4.65.0: Gesamt-Punkte vom Server (Fenster-Vorfall 22.07.) ----------

  test('Gesamt kommt vom SERVER: Punkte sinken nicht mehr, wenn alte Einträge aus dem 300er-Fenster fallen (v4.65.0)', async ({ context, page }) => {
    // Nachbau des Live-Vorfalls: Familie hat >300 Einträge; der Client
    // bekommt nur die neuesten 300 — die wahren Summen liefert log_totals.
    const win = Array.from({ length: 40 }, (_, i) => ({
      id: 'l-' + i, chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: '',
      member_id: i % 2 ? 'm-mira' : 'm-chris', member_name: i % 2 ? 'Mira' : 'Timon', points: 1,
      done_at: weekSafeAgo(i * 3600e3),
      created_at: weekSafeAgo(i * 3600e3), family_id: FAM }));
    await mockBackend(context, { logRows: () => win });   // «Fenster»: 20/20 Punkte
    await context.route(`${SB}/rest/v1/log_totals**`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { member_id: 'm-mira', pts: 163, n: 128 },        // WAHRE Summen inkl. der
        { member_id: 'm-chris', pts: 165, n: 137 },       // aus dem Fenster gefallenen
      ]) }));
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await page.locator('[data-p="all"]').click();
    await expect(page.locator('.score', { hasText: 'Mira' })).toContainText('163');
    await expect(page.locator('.score', { hasText: 'Mira' })).toContainText('128 Aufgaben');
    await expect(page.locator('.score', { hasText: 'Timon' })).toContainText('165');
    // «Diese Woche» bleibt Fensterrechnung (Woche liegt im Fenster)
    await page.locator('[data-p="week"]').click();
    await expect(page.locator('.score', { hasText: 'Mira' })).toContainText('20');
  });

  test('Gesamt-Fallback: liefert log_totals einen Fehler, rechnet der Client wie bisher aus dem Fenster — nie Nullen (v4.65.0)', async ({ context, page }) => {
    await mockBackend(context);
    await context.route(`${SB}/rest/v1/log_totals**`, route => route.fulfill({ status: 500, body: 'kaputt' }));
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await page.locator('[data-p="all"]').click();
    await expect(page.locator('.score .num').first()).not.toHaveText('0');
  });

  test('Gesamt zieht sofort mit: Eintragen erhöht, Löschen (nach Undo-Fenster) senkt — ohne auf den Pull zu warten (v4.65.0)', async ({ context, page }) => {
    test.setTimeout(30000);
    await mockBackend(context);
    await context.route(`${SB}/rest/v1/log**`, route => {
      const m = route.request().method();
      if (m === 'POST' || m === 'PATCH' || m === 'DELETE') return route.fulfill({ status: 204, body: '' });
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(700);
    const num = () => page.locator('.score', { hasText: 'Mira' }).locator('.num').innerText();
    await page.locator('.chip', { hasText: 'Mira' }).click();
    await page.locator('button.chore[data-cid="c-1"]').click();       // +2 Punkte
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await page.locator('[data-p="all"]').click();
    const after = parseInt(await num(), 10);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await page.locator('#list .entry').first().click();
    await page.locator('#delLog').click();
    await page.waitForTimeout(5600);                                  // Undo-Fenster verstreicht
    await page.getByRole('tab', { name: 'Punkte' }).click();
    const final = parseInt(await num(), 10);
    expect(final).toBe(after - 2);                                    // Grabstein senkt Gesamt sofort
  });

  // ---------- v4.66.0: Summen-Banner im Verlauf + Wochen-Filter von der Punkte-Karte ----------

  test('Verlauf-Banner summiert die ANGEZEIGTEN Einträge — folgt Personen-Filter und Suche (v4.66.0)', async ({ context, page }) => {
    const mk = (id, mid, mname, chore, pts, hoursAgo) => ({ id, chore_id: null, chore_name: chore,
      chore_note: '', member_id: mid, member_name: mname, points: pts,
      done_at: new Date(Date.now() - hoursAgo * 3600e3).toISOString(),
      created_at: new Date().toISOString(), family_id: FAM });
    await mockBackend(context, { logRows: () => [
      mk('l-1', 'm-mira', 'Mira', 'Staubsaugen', 3, 1),
      mk('l-2', 'm-chris', 'Timon', 'Kochen', 2, 2),
      mk('l-3', 'm-mira', 'Mira', 'Einkaufen', 1, 3),
    ] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('#logSum')).toHaveText('3 Einträge · 6 Punkte');
    // Personen-Filter (Gesamt-Ansicht → KEINE Wochen-Einschränkung)
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await page.locator('[data-p="all"]').click();
    await page.locator('.score[data-mid="m-mira"]').click();
    await expect(page.locator('#logSum')).toHaveText('2 Einträge · 4 Punkte');
    await expect(page.locator('.filterpill')).not.toContainText('Woche');
    // Suche grenzt weiter ein — der Banner folgt
    await page.locator('#openSettings').click();
    await page.locator('#setSearch').click();
    await page.locator('#searchInput').fill('staub');
    await expect(page.locator('#logSum')).toHaveText('1 Eintrag · 3 Punkte');
    // Nichts gefunden → kein Banner (die Leermeldung spricht für sich)
    await page.locator('#searchInput').fill('zzz');
    await expect(page.locator('#logSum')).toHaveCount(0);
  });

  test('Punkte-Karte in der WOCHEN-Ansicht öffnet den Verlauf auf Person UND Woche beschränkt (v4.66.0)', async ({ context, page }) => {
    const mk = (id, mid, mname, chore, pts, daysAgo) => ({ id, chore_id: null, chore_name: chore,
      chore_note: '', member_id: mid, member_name: mname, points: pts,
      done_at: new Date(Date.now() - daysAgo * 86400e3).toISOString(),
      created_at: new Date().toISOString(), family_id: FAM });
    await mockBackend(context, { logRows: () => [
      mk('l-1', 'm-mira', 'Mira', 'Staubsaugen', 2, 0),      // heute → in der Woche
      mk('l-2', 'm-mira', 'Mira', 'Fenster putzen', 5, 9),   // 9 Tage alt → sicher davor
      mk('l-3', 'm-chris', 'Timon', 'Kochen', 2, 0),
    ] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();  // Standard: «Diese Woche»
    await page.locator('.score[data-mid="m-mira"]').click();
    // Nur Miras DIESWÖCHIGER Eintrag; die Pill sagt es
    await expect(page.locator('.filterpill')).toContainText('Mira');
    await expect(page.locator('.filterpill')).toContainText('Woche');
    await expect(page.locator('#list')).toContainText('Staubsaugen');
    await expect(page.locator('#list')).not.toContainText('Fenster putzen');
    await expect(page.locator('#list')).not.toContainText('Kochen');
    await expect(page.locator('#logSum')).toHaveText('1 Eintrag · 2 Punkte');
    // Pill lösen → Woche UND Person fallen zusammen weg
    await page.locator('#clearLogFilter').click();
    await expect(page.locator('.filterpill')).toHaveCount(0);
    await expect(page.locator('#list')).toContainText('Fenster putzen');
    await expect(page.locator('#list')).toContainText('Kochen');
    // Aus der GESAMT-Ansicht getippt: Filter ohne Wochen-Einschränkung
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await page.locator('[data-p="all"]').click();
    await page.locator('.score[data-mid="m-mira"]').click();
    await expect(page.locator('.filterpill')).toContainText('Mira');
    await expect(page.locator('.filterpill')).not.toContainText('Woche');
    await expect(page.locator('#list')).toContainText('Fenster putzen');
  });

  test('Verlauf-Banner sagt ehrlich, wenn ältere Zeilen fehlen — Fenster-Summe geht nie stumm als Gesamt durch (v4.66.0)', async ({ context, page }) => {
    // Nachbau des 22.07.-Vorfalls aus Verlaufs-Sicht: das Fenster hält 2
    // Einträge einer Person, die Server-Summen kennen 128. Der Banner nennt
    // beide Zahlen, statt 2 als «alles» zu verkaufen.
    const mk = (id, mid, mname, pts, hoursAgo) => ({ id, chore_id: null, chore_name: 'Müll rausbringen',
      chore_note: '', member_id: mid, member_name: mname, points: pts,
      done_at: new Date(Date.now() - hoursAgo * 3600e3).toISOString(),
      created_at: new Date().toISOString(), family_id: FAM });
    await mockBackend(context, { logRows: () => [
      mk('l-1', 'm-mira', 'Mira', 2, 1), mk('l-2', 'm-mira', 'Mira', 1, 2),
    ] });
    await context.route(`${SB}/rest/v1/log_totals**`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
        { member_id: 'm-mira', pts: 155, n: 128 },
      ]) }));
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await page.locator('[data-p="all"]').click();
    await page.locator('.score[data-mid="m-mira"]').click();
    await expect(page.locator('#logSum')).toHaveText('2 von 128 Einträgen geladen · 3 von 155 Punkten');
  });

  // ---------- v4.67.0: Wochenziel als Beta (families.beta) ----------

  test('Wochenziel ist Standard: auch OHNE families.beta gibt es Zielfeld, 🎯-Marke und Ziel-Rangliste (v4.74.0)', async ({ context, page }) => {
    // Umkehrung des v4.67.0-Tests: damals war die Zusage «ohne Beta inert».
    // Seit v4.74.0 gilt das Gegenteil — das Wochenziel ist Standard, und der
    // Beta-Schalter gehoert nur noch dem URL-Experiment (v4.73.0).
    await mockBackend(context, { famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: null }],
      memberRows: () => [
        { id: 'm-chris', name: 'Timon', color: '#2FAE6A', family_id: FAM, url_slug: 'slugchris1', admin: true, goal: null },
        { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', goal: 8 },
      ] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(700);
    await page.evaluate(() => document.getElementById('openMembers').click());
    await expect(page.locator('#memberSheet')).toBeVisible();
    await expect(page.locator('#memberSheet .assistbadge', { hasText: '🎯8' })).toBeVisible();
    await openPerson(page, 'm-mira');
    await expect(page.locator('#psGoal')).toHaveValue('8');      // Zielfeld ohne Beta …
    await expect(page.locator('#psChart')).toHaveCount(1);       // … und Wochen-Balken
    await page.locator('#psDone').click();
    await page.evaluate(() => document.getElementById('memberSheet').close());
    // Rangliste nach Zielerreichung, Trenner fuer den ziellosen Block
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await expect(page.locator('.score .num.pct').first()).toBeVisible();
    await expect(page.locator('.scoresep')).toHaveText('ohne Wochenziel');
    // Der Beta-Schalter bleibt sichtbar NUR fuer Beta-Haushalte …
    await page.locator('#openSettings').click();
    await expect(page.locator('#setBetaOff')).toHaveCount(0);
  });

  test('Der Adressleisten-Schalter nimmt NICHT das Wochenziel weg (v4.74.0/v4.75.0/v4.77.0)', async ({ browser }) => {
    // Regressionswache gegen die Kopplung: haenge das Wochenziel je wieder an
    // BETA, dann nimmt der Schalter einem Haushalt ein ausgeliefertes Feature
    // weg. Der Schalter existiert seit v4.77.0 NUR auf Android/Desktop (auf
    // iOS fehlt die Zeile absichtlich, s. iOS-Test) — also prueft dieser Test
    // mit Android-UA, sonst behauptet er auf dem iPhone-Projekt einen Knopf,
    // den es dort bewusst nicht gibt (genau daran ist er einmal gescheitert).
    await withUA(browser, UA_ANDROID, async ctx => {
      await mockBackend(ctx, { famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: null }],
        memberRows: () => [
          { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', admin: true, goal: 8 },
        ] });
      const page = await ctx.newPage();
      page.on('dialog', d => d.accept());
      await page.goto(`${BASE}/f/${FAM}`);
      await page.waitForTimeout(700);
      await page.locator('#openSettings').click();
      await expect(page.locator('#setStripUrl')).toContainText('Adressleiste');
      await expect(page.locator('#setStripUrl')).not.toContainText('Wochenziel');
      await page.locator('#setStripUrl').click();
      await page.waitForTimeout(300);
      // Schalter betaetigt — das Ziel ist trotzdem noch da
      await page.getByRole('tab', { name: 'Punkte' }).click();
      await expect(page.locator('.score .num.pct').first()).toBeVisible();
      await page.evaluate(() => document.getElementById('openMembers').click());
      await openPerson(page, 'm-mira');
      await expect(page.locator('#psGoal')).toHaveValue('8');
    });
  });

  test('MIT Beta: Ziel setzen im Personen-Sheet, Kind führt die Wochen-Rangliste an (v4.67.0)', async ({ context, page }) => {
    let saved = null;
    const now = new Date().toISOString();
    const mk = (id, mid, name, pts) => ({ id, chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: '',
      member_id: mid, member_name: name, points: pts, done_at: now, created_at: now, family_id: FAM });
    await mockBackend(context, {
      famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }],
      memberRows: () => [
        { id: 'm-chris', name: 'Timon', color: '#2FAE6A', family_id: FAM, url_slug: 'slugchris1', admin: true, goal: null },
        { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', goal: null },
      ],
      logRows: () => [mk('l-1', 'm-chris', 'Timon', 12), mk('l-2', 'm-mira', 'Mira', 6)] });
    await context.route(`${SB}/rest/v1/members**`, route => {
      const req = route.request();
      if (req.method() === 'POST') {
        const rows = JSON.parse(req.postData() || '[]');
        const g = (Array.isArray(rows) ? rows : [rows]).find(r => r.goal);
        if (g) saved = g;
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(700);
    // Ohne Ziel: Timon (12) führt
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await expect(page.locator('.score .name').first()).toContainText('Timon');
    // Ziel 8 für Mira setzen
    await page.evaluate(() => document.getElementById('openMembers').click());
    await openPerson(page, 'm-mira');
    await expect(page.locator('#psGoal')).toBeVisible();
    await page.locator('#psGoal').fill('8');
    await page.locator('#psDone').click();
    await page.locator('#doneMembers').click();
    await page.waitForTimeout(400);
    expect(saved).not.toBeNull();
    expect(saved.goal).toBe(8);
    // Jetzt führt Mira mit 6/8 = 75 % vor Timon (12 Punkte, kein Ziel)
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await expect(page.locator('.score .name').first()).toContainText('Mira');
    await expect(page.locator('.score .name').first()).toContainText('👑');
    // seit v4.70.0 steht die Zielerreichung als GROSSE Zahl (Ranking-Kriterium);
    // die Punkte nennt seit v4.70.1 NUR noch die Unterzeile
    await expect(page.locator('.score .num.pct').first()).toContainText('75');
    await expect(page.locator('.score .sub').first()).toContainText('6 von 8 Punkten');
    await expect(page.locator('.score').nth(1)).toContainText('erledigt');   // Timon unverändert
  });

  test('Beta: «Gesamt» bleibt das absolute Register — Ziele wirken nur in «Diese Woche» (v4.67.0)', async ({ context, page }) => {
    const now = new Date().toISOString();
    const mk = (id, mid, name, pts) => ({ id, chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: '',
      member_id: mid, member_name: name, points: pts, done_at: now, created_at: now, family_id: FAM });
    await mockBackend(context, {
      famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }],
      memberRows: () => [
        { id: 'm-chris', name: 'Timon', color: '#2FAE6A', family_id: FAM, url_slug: 'slugchris1', admin: true, goal: null },
        { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', goal: 8 },
      ],
      logRows: () => [mk('l-1', 'm-chris', 'Timon', 12), mk('l-2', 'm-mira', 'Mira', 6)] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await expect(page.locator('.score .name').first()).toContainText('Mira');      // Woche: Ziel gewinnt
    await page.locator('[data-p="all"]').click();
    await page.waitForTimeout(300);
    await expect(page.locator('.score .name').first()).toContainText('Timon');     // Gesamt: Punkte zählen
    await expect(page.locator('#list')).not.toContainText('%');
  });

  test('Beta: Ziel leeren entfernt es wieder, Karte rendert wie vorher (v4.67.0)', async ({ context, page }) => {
    await mockBackend(context, {
      famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }],
      memberRows: () => [
        { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', goal: 8 },
      ] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(700);
    await page.evaluate(() => document.getElementById('openMembers').click());
    await expect(page.locator('.prow[data-pid="m-mira"] .assistbadge', { hasText: '🎯8' })).toBeVisible();
    await openPerson(page, 'm-mira');
    await expect(page.locator('#psGoal')).toHaveValue('8');      // Ziel vorhanden → Feld gefuellt
    await page.locator('#psGoal').fill('');
    await page.locator('#psDone').click();
    await page.evaluate(() => document.getElementById('memberSheet').close());
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await expect(page.locator('.score .sub').first()).toContainText('erledigt');
    await expect(page.locator('#list')).not.toContainText('%');
  });

  // ---------- v4.70.0: Ziel-Balken mit Kopfraum + prominente Zielerreichung ----------

  const goalFixture = async (context, rows) => {
    const now = new Date().toISOString();
    const M = (id, name, goal) => ({ id, name, color: '#3E6BD6', family_id: FAM,
      url_slug: 'slug' + name.toLowerCase(), goal });
    const L = (id, mid, name, pts) => ({ id, chore_id: 'c-1', chore_name: 'Müll rausbringen',
      chore_note: '', member_id: mid, member_name: name, points: pts,
      done_at: now, created_at: now, family_id: FAM });
    await mockBackend(context, {
      famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }],
      memberRows: () => rows.map(r => M(r.id, r.name, r.goal)),
      logRows: () => rows.filter(r => r.pts).map(r => L('l-' + r.id, r.id, r.name, r.pts)) });
  };
  // Balken-Geometrie in PROZENT der Balkenbreite — misst gerendert, nicht den
  // style-String: nur so faellt auf, wenn CSS die Rechnung wieder einfaengt.
  const barGeo = (page, mid) => page.evaluate(id => {
    const bar = document.querySelector(`.score[data-mid="${id}"] .bar`);
    const r = bar.getBoundingClientRect(), pc = x => x / r.width * 100;
    const over = bar.querySelector('b.over'), tick = bar.querySelector('u.tick');
    return {
      fill: pc(bar.querySelector('i').getBoundingClientRect().width),
      over: over ? pc(over.getBoundingClientRect().width) : 0,
      tick: tick ? pc(tick.getBoundingClientRect().left - r.left) : null,
      capped: bar.classList.contains('capped'),
    };
  }, mid);
  const near = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1.5);

  test('Ziel-Balken hat Kopfraum: 100 % liegen bei 80 % Breite, Übererfüllung füllt den Rest (v4.70.0)', async ({ context, page }) => {
    // Vorher endete der Balken bei 100 %: 100 %, 120 % und 300 % sahen
    // IDENTISCH aus — ausgerechnet die Zahl, die die Rangliste entscheidet.
    await goalFixture(context, [
      { id: 'm-a', name: 'Mira', goal: 10, pts: 0 },     //   0 %
      { id: 'm-b', name: 'Timon', goal: 10, pts: 5 },    //  50 %
      { id: 'm-c', name: 'Noel', goal: 10, pts: 10 },    // 100 % → exakt auf der Marke
      { id: 'm-d', name: 'Carla', goal: 10, pts: 12 },   // 120 % → Kopfraum angebrochen
      { id: 'm-e', name: 'Anna', goal: 10, pts: 20 },    // 200 % → voll, gekappt
    ]);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await expect(page.locator('.score')).toHaveCount(5);

    const g0 = await barGeo(page, 'm-a');
    near(g0.fill, 0); near(g0.tick, 80); expect(g0.over).toBe(0);
    const g50 = await barGeo(page, 'm-b');
    near(g50.fill, 40); near(g50.tick, 80); expect(g50.over).toBe(0);
    // Auf der Marke: Balken endet GENAU am Strich, Kopfraum noch unberührt
    const g100 = await barGeo(page, 'm-c');
    near(g100.fill, 80); near(g100.tick, 80); expect(g100.over).toBe(0);
    expect(g100.capped).toBe(false);
    // Darüber: sichtbar mehr als am Strich, aber noch nicht am Anschlag
    const g120 = await barGeo(page, 'm-d');
    near(g120.fill, 80); near(g120.over, 16); near(g120.fill + g120.over, 96);
    expect(g120.capped).toBe(false);
    // Weit darüber: Balken voll, Kappen-Spitze sagt «geht weiter»
    const g200 = await barGeo(page, 'm-e');
    near(g200.fill + g200.over, 100);
    expect(g200.capped).toBe(true);
    // Monoton: mehr Zielerreichung = mehr Farbe. Genau das fehlte vorher.
    expect(g100.fill + g100.over).toBeLessThan(g120.fill + g120.over);
    expect(g120.fill + g120.over).toBeLessThan(g200.fill + g200.over);
  });

  test('Zielerreichung ist die EINZIGE grosse Zahl — Punkte nur in der Unterzeile (v4.70.1)', async ({ context, page }) => {
    await goalFixture(context, [
      { id: 'm-a', name: 'Mira', goal: 30, pts: 36 },    // 120 % — erreicht
      { id: 'm-b', name: 'Timon', goal: 15, pts: 5 },    //  33 % — offen
      { id: 'm-c', name: 'Noel', goal: 20, pts: 0 },     //   0 % — noch nichts
    ]);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    const card = mid => page.locator(`.score[data-mid="${mid}"]`);
    await expect(card('m-a').locator('.num.pct')).toHaveText('120%');
    await expect(card('m-a').locator('.sub')).toHaveText('36 von 30 Punkten');
    await expect(card('m-b').locator('.num.pct')).toHaveText('33%');
    await expect(card('m-b').locator('.sub')).toHaveText('5 von 15 Punkten');
    await expect(card('m-c').locator('.num.pct')).toHaveText('0%');
    await expect(card('m-c').locator('.sub')).toHaveText('0 von 20 Punkten');
    // v4.70.1: KEINE Nebenzahl im Kopf — die Punkte stehen genau EINMAL je Karte.
    // (v4.70.0 hatte sie daneben; «36 … 36 von 30» war Doppelung, «0 0 %» las
    // sich wie ein Fehler.)
    await expect(page.locator('.score .pts')).toHaveCount(0);
    await expect(card('m-a').locator('.top')).toContainText('120%');
    await expect(card('m-a').locator('.top')).not.toContainText('36');   // Punkte NUR unten
    await expect(card('m-b').locator('.top')).not.toContainText('5 ');
    // Erreicht/nicht erreicht ist auf einen Blick unterscheidbar (nicht NUR Farbe:
    // die Zahl selbst und der Strich im Balken tragen die Information)
    await expect(card('m-a').locator('.num.pct')).toHaveClass(/hit/);
    await expect(card('m-b').locator('.num.pct')).not.toHaveClass(/hit/);
  });

  test('Ohne Ziel bleibt die Punkte-Karte unverändert: Punkte gross, kein Strich, kein Prozent (v4.70.0)', async ({ context, page }) => {
    // Die Zusage an alle anderen Haushalte gilt auch fuer das neue Layout.
    await goalFixture(context, [
      { id: 'm-a', name: 'Mira', goal: null, pts: 12 },
      { id: 'm-b', name: 'Timon', goal: null, pts: 4 },
    ]);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await expect(page.locator('.score .num').first()).toHaveText('12');
    await expect(page.locator('.score .pts')).toHaveCount(0);
    await expect(page.locator('.score .bar u.tick')).toHaveCount(0);
    await expect(page.locator('.score .bar.goal')).toHaveCount(0);
    await expect(page.locator('#list')).not.toContainText('%');
    await expect(page.locator('.scoresep')).toHaveCount(0);   // reine Liste = kein Trenner
    // relativer Balken wie bisher: der Beste fuellt ganz
    near((await barGeo(page, 'm-a')).fill, 100);
    near((await barGeo(page, 'm-b')).fill, 33);
  });

  // ---------- v4.71.0: gemischter Zustand = zwei Bloecke ----------

  test('Teilweise gesetzte Ziele: Trenner sagt an, wo der Massstab wechselt (v4.71.0)', async ({ context, page }) => {
    // Live-Befund: im gemischten Zustand standen zwei Balkenarten unkommentiert
    // untereinander und massen Verschiedenes (Ziel vs. relativ zum Besten).
    // 1 von 100 Punkten trug die Krone, waehrend 80 Punkte darunter voll
    // ausschlugen. Die Reihenfolge (erst Ziele, dann Ziellose) ist unveraendert
    // — neu ist, dass die Liste SAGT, dass sie zwei Register hat.
    await goalFixture(context, [
      { id: 'm-a', name: 'Mira', goal: 100, pts: 1 },     // Ziel,   1 %
      { id: 'm-b', name: 'Timon', goal: 30, pts: 0 },     // Ziel,   0 %
      { id: 'm-c', name: 'Noel', goal: null, pts: 80 },   // kein Ziel, fleissig
      { id: 'm-d', name: 'Carla', goal: null, pts: 40 },  // kein Ziel
    ]);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    // Block 1 nach Zielerreichung, Block 2 nach Punkten — beide fuer sich sortiert
    await expect(page.locator('.score .name')).toHaveText([/Mira/, /Timon/, /Noel/, /Carla/]);
    // Der Trenner steht GENAU zwischen den Bloecken, nicht irgendwo
    await expect(page.locator('.scoresep')).toHaveCount(1);
    await expect(page.locator('.scoresep')).toHaveText('ohne Wochenziel');
    const order = await page.locator('#list > div').evaluateAll(
      els => els.map(e => e.className.split(' ')[0] + (e.dataset.mid ? ':' + e.dataset.mid : '')));
    expect(order).toEqual(['period', 'score:m-a', 'score:m-b', 'scoresep', 'score:m-c', 'score:m-d']);
    await expect(page.locator('.score .bar.goal')).toHaveCount(2);   // nur oben Ziel-Balken
  });

  test('Der ziellose Block hat SEINEN eigenen Massstab — ein fleissiger Ziel-Träger staucht ihn nicht mehr (v4.71.0)', async ({ context, page }) => {
    // Vorher war die Bezugsgroesse der beste ueberhaupt: Mira (Ziel, 90 Punkte)
    // drueckte Noel auf 44 % und Carla auf 22 %, obwohl Noel der Beste seines
    // Blocks ist. Zwei Register, zwei Bezugsgroessen.
    await goalFixture(context, [
      { id: 'm-a', name: 'Mira', goal: 100, pts: 90 },    // Ziel UND die meisten Punkte
      { id: 'm-c', name: 'Noel', goal: null, pts: 40 },   // Bester ohne Ziel
      { id: 'm-d', name: 'Carla', goal: null, pts: 20 },
    ]);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    near((await barGeo(page, 'm-c')).fill, 100);   // 40 von 40 — nicht 40 von 90
    near((await barGeo(page, 'm-d')).fill, 50);    // 20 von 40 — nicht 20 von 90
    near((await barGeo(page, 'm-a')).fill, 72);    // Ziel-Balken unberuehrt: 90 % × 0,8
  });

  test('Gemischt: die Krone bleibt beim Ziel-Block und verschwindet, wenn dort niemand Punkte hat (v4.71.0)', async ({ context, page }) => {
    await goalFixture(context, [
      { id: 'm-a', name: 'Mira', goal: 30, pts: 0 },      // Ziel, aber nichts getan
      { id: 'm-b', name: 'Timon', goal: null, pts: 80 },  // kein Ziel, fleissig
    ]);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    // Niemand hat sein Ziel angefasst → gar keine Krone. Ehrlicher, als sie fuer
    // 0 % zu vergeben (alte Regel) oder sie in den ziellosen Block zu schieben.
    await expect(page.locator('#list')).not.toContainText('👑');
    await expect(page.locator('.scoresep')).toHaveCount(1);
  });

  test('Gemischt nur in «Diese Woche»: unter «Gesamt» gibt es keine Blöcke (v4.71.0)', async ({ context, page }) => {
    await goalFixture(context, [
      { id: 'm-a', name: 'Mira', goal: 30, pts: 12 },
      { id: 'm-b', name: 'Timon', goal: null, pts: 80 },
    ]);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await expect(page.locator('.scoresep')).toHaveCount(1);
    await page.locator('[data-p="all"]').click();
    // «Gesamt» ist das absolute Register: keine Ziele, kein Trenner, Punkte zaehlen
    await expect(page.locator('.scoresep')).toHaveCount(0);
    await expect(page.locator('.score .name').first()).toContainText('Timon');
    await expect(page.locator('#list')).not.toContainText('%');
  });

  test('«Gesamt» zeigt Ø Punkte/Woche als Messlatte fürs Wochenziel — für alle Haushalte (v4.68.0/v4.74.0)', async ({ context, page }) => {
    const mk = (id, off, pts) => ({ id, chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: '',
      member_id: 'm-mira', member_name: 'Mira', points: pts,
      done_at: new Date(Date.now() - off).toISOString(), created_at: new Date(Date.now() - off).toISOString(), family_id: FAM });
    // Ersteintrag vor ~4 Wochen, 20 Punkte gesamt → Ø 5/Woche
    const rows = [mk('l-a', 28 * 86400e3 - 3600e3, 8), mk('l-b', 14 * 86400e3, 6), mk('l-c', 3600e3, 6)];
    await mockBackend(context, {
      famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: null }],   // v4.74.0: kein Beta noetig
      memberRows: () => [{ id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', goal: null }],
      logRows: () => rows });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Punkte' }).click();
    await page.locator('[data-p="all"]').click();
    await expect(page.locator('.score .sub').first()).toContainText('Ø 5/Woche');
    await page.locator('[data-p="week"]').click();
    await expect(page.locator('.score .sub').first()).not.toContainText('Ø');   // Woche: keine Ø-Zeile
  });

  test('Pro-Person-Sheet (Beta): Wochen-Balken aus log_weekly — 8 Slots, Lücken = 0, Ziellinie (v4.69.0)', async ({ context, page }) => {
    const wk = off => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - off * 7); return d.toISOString(); };
    const mk = (id, at, pts) => ({ id, chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: '',
      member_id: 'm-mira', member_name: 'Mira', points: pts, done_at: at, created_at: at, family_id: FAM });
    // Punkte in dieser Woche (6), vor 2 Wochen (10) und vor 5 Wochen (4) — Wochen 1/3/4/6/7 leer
    await mockBackend(context, {
      famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }],
      memberRows: () => [{ id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', goal: 8 }],
      logRows: () => [mk('l-1', wk(0), 6), mk('l-2', wk(2), 10), mk('l-3', wk(5), 4)] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(600);
    await page.evaluate(() => document.getElementById('openMembers').click());
    await openPerson(page, 'm-mira');
    await expect(page.locator('#psChart')).toBeVisible();
    await expect(page.locator('#psChart i')).toHaveCount(8);
    await expect(page.locator('#psChart .wkgoal')).toHaveCount(1);          // Ziellinie bei Ziel 8
    const heights = await page.$$eval('#psChart i', els => els.map(el => parseInt(el.style.height)));
    // max = 10 (vor 2 Wochen) → 100 %; diese Woche 6/10 = 60 %; vor 5 Wochen 4/10 = 40 %; leere = 3 % Sockel
    expect(heights[7]).toBe(60);            // aktuelle Woche (letzter Slot)
    expect(heights[5]).toBe(100);
    expect(heights[2]).toBe(40);
    expect(heights[0]).toBe(3); expect(heights[6]).toBe(3);
    await expect(page.locator('#psChart i.cur')).toHaveCount(1);
    // Ziel im Feld ändern → Ziellinie folgt sofort (aus dem Slot-Cache, ohne Refetch)
    await page.locator('#psGoal').fill('10');
    await expect(page.locator('#psChart .wkgoal')).toHaveCount(1);
    await page.locator('#psDone').click();
  });

  test('PGRST102-Wache: ungleiche Schlüsselmengen werden in getrennten Batches gesendet (v4.69.2)', async ({ context, page }) => {
    const reqs = [];
    await mockBackend(context, {
      famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }],
      memberRows: () => [
        { id: 'm-chris', name: 'Timon', color: '#2FAE6A', family_id: FAM, url_slug: 'slugchris1', admin: true, assisted: false, goal: null },
        { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', admin: false, assisted: false, goal: null },
      ] });
    await context.route(`${SB}/rest/v1/members**`, route => {
      const req = route.request();
      if (req.method() === 'POST') {
        const rows = [].concat(JSON.parse(req.postData() || '[]'));
        reqs.push(rows);
        // wie PostgREST: heterogene Schluesselmengen -> 400 PGRST102
        const sigs = new Set(rows.map(r => Object.keys(r).sort().join(',')));
        if (sigs.size > 1) return route.fulfill({ status: 400, body: '{"code":"PGRST102"}' });
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(600);
    // frisch angelegte Person (3 Schluessel) UND bearbeitete gepullte Person
    // (volle Spalten) in derselben Sitzung aendern
    await page.evaluate(() => document.getElementById('openMembers').click());
    await page.locator('#addMember').click();
    await expect(page.locator('#personSheet')).toBeVisible();
    await page.locator('#psName').fill('Nova');
    await page.locator('#psDone').click();
    await openPerson(page, 'm-mira');
    await page.locator('#psGoal').fill('8');
    await page.locator('#psDone').click();
    await expect.poll(() => reqs.flat().some(r => r.name === 'Nova')).toBe(true);
    await expect.poll(() => reqs.flat().some(r => r.id === 'm-mira' && r.goal === 8)).toBe(true);
    // JEDER Request hatte eine EINHEITLICHE Schluesselmenge (kein 400 noetig)
    for (const rows of reqs) {
      const sigs = new Set(rows.map(r => Object.keys(r).sort().join(',')));
      expect(sigs.size).toBeLessThanOrEqual(1);
    }
  });

  test('Esc speichert auch: Ziel setzen, Escape drücken — der POST kommt trotzdem, genau EINMAL (v4.69.2)', async ({ context, page }) => {
    const posts = [];
    await mockBackend(context, {
      famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }],
      memberRows: () => [
        { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', goal: null },
        { id: 'm-noel', name: 'Noel', color: '#888888', family_id: FAM, url_slug: 'slugnoel1', goal: null },
      ] });
    await context.route(`${SB}/rest/v1/members**`, route => {
      const req = route.request();
      if (req.method() === 'POST') { posts.push([].concat(JSON.parse(req.postData() || '[]'))); return route.fulfill({ status: 201, body: '' }); }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(600);
    await page.evaluate(() => document.getElementById('openMembers').click());
    await openPerson(page, 'm-mira');
    await page.locator('#psGoal').fill('9');
    await page.keyboard.press('Escape');
    await expect.poll(() => posts.flat().filter(r => r.id === 'm-mira').length).toBe(1);
    // und der Knopf-Weg erzeugt trotz onclose-Netz KEINEN Doppel-POST
    await openPerson(page, 'm-noel');
    await page.locator('#psGoal').fill('4');
    await page.locator('#psDone').click();
    await page.waitForTimeout(500);
    expect(posts.flat().filter(r => r.id === 'm-noel').length).toBe(1);
  });

  test('Reload mitten im Bearbeiten verliert nichts: Marke überlebt, Boot synchronisiert nach (v4.69.2)', async ({ context, page }) => {
    const posts = [];
    await mockBackend(context, {
      famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }],
      memberRows: () => [{ id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', goal: null }] });
    await context.route(`${SB}/rest/v1/members**`, route => {
      const req = route.request();
      if (req.method() === 'POST') { posts.push([].concat(JSON.parse(req.postData() || '[]'))); return route.fulfill({ status: 201, body: '' }); }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(600);
    await page.evaluate(() => document.getElementById('openMembers').click());
    await openPerson(page, 'm-mira');
    await page.locator('#psGoal').fill('7');
    await page.waitForTimeout(150);
    await page.reload();                                   // Sheet NIE geschlossen — wie ein SW-Update
    await expect.poll(() => posts.flat().some(r => r.id === 'm-mira' && r.goal === 7), { timeout: 6000 }).toBe(true);
  });

  // ---------- v4.69.2: PGRST102-Wache, Reload-Nachzug, Esc, ehrlicher Fehler ----------

  test('Boot-Nachzug mit GEMISCHTEN offenen Marken: formgleich gruppiert, und der erste Pull setzt das Ziel nicht zurück (v4.69.2)', async ({ context, page }) => {
    // Reload mitten im Bearbeiten: zwei offene Marken — Mira (voller
    // Server-Umriss + frisches Ziel) und Nova (frisch angelegt: NUR
    // id/name/color/family_id). Vor der Wache platzte GENAU dieser Sync
    // als EIN Batch mit 400 PGRST102 («All object keys must match») —
    // live am Server nachgewiesen. Jetzt: ein Request je Schluessel-Signatur.
    const mira = { id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', admin: false, assisted: false, goal: 7 };
    const nova = { id: 'm-nova', name: 'Nova', color: '#E8B931', family_id: FAM };
    const posts = [];
    await mockBackend(context, {
      famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }],
      memberRows: () => [{ ...mira, goal: null }] });   // Server: Ziel noch nicht angekommen, Nova unbekannt
    await context.route(`${SB}/rest/v1/members**`, route => {
      const req = route.request();
      if (req.method() === 'POST') { posts.push(req.postDataJSON()); return route.fulfill({ status: 201, body: '' }); }
      return route.fallback();
    });
    await context.addInitScript(([fam, m, n]) => {
      localStorage.setItem('haushalt.v2:' + fam, JSON.stringify({ members: [m, n], chores: [], log: [], famName: 'Testhaushalt' }));
      localStorage.setItem('haushalt.pendmemb:' + fam, JSON.stringify([m.id, n.id]));
    }, [FAM, mira, nova]);
    await page.goto(`${BASE}/f/${FAM}`);
    await expect.poll(() => posts.flat().length, { timeout: 6000 }).toBeGreaterThanOrEqual(2);
    // jeder Batch in sich formgleich (die PGRST102-Bedingung), zusammen vollständig
    for (const batch of posts) {
      const sigs = new Set([].concat(batch).map(r => Object.keys(r).sort().join(',')));
      expect(sigs.size).toBe(1);
    }
    const all = posts.flat();
    expect(all.find(r => r.id === 'm-mira').goal).toBe(7);
    expect(all.some(r => r.id === 'm-nova')).toBe(true);
    // und der Boot-Pull (Serverstand: goal null) darf das lokale Ziel NICHT
    // zuruecksetzen — der Nachzug lief synchron VOR dem ersten Reconcile
    await page.waitForTimeout(800);
    await page.evaluate(() => document.getElementById('openMembers').click());
    await expect(page.locator('.prow[data-pid="m-mira"] .assistbadge', { hasText: '🎯7' })).toBeVisible();
  });

  test('Scheitert der Personen-Upsert, sagt es die App — und die Marke bleibt für den nächsten Versuch (v4.69.2/.3)', async ({ context, page }) => {
    await mockBackend(context, {
      famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }],
      memberRows: () => [{ id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', goal: null }] });
    let fail = true; const oks = [];
    await context.route(`${SB}/rest/v1/members**`, route => {
      const req = route.request();
      if (req.method() === 'POST') {
        if (fail) return route.fulfill({ status: 400,
          contentType: 'application/json', body: '{"code":"PGRST102","message":"All object keys must match"}' });
        oks.push([].concat(JSON.parse(req.postData() || '[]')));
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(600);
    await page.evaluate(() => document.getElementById('openMembers').click());
    await openPerson(page, 'm-mira');
    await page.locator('#psGoal').fill('9');
    await page.locator('#psDone').click();
    await expect(page.locator('#toast')).toContainText('Sync fehlgeschlagen');
    // v4.69.3: die Marke kommt nach dem Scheitern ZURUECK (persistiert) —
    // eine spaetere Speichern-Geste versucht dieselbe Person erneut
    await expect.poll(() => page.evaluate(fam =>
      JSON.parse(localStorage.getItem('haushalt.pendmemb:' + fam) || '[]'), FAM)).toContain('m-mira');
    fail = false;                                        // Server wieder gesund
    await page.evaluate(() => document.getElementById('openMembers').click());
    await openPerson(page, 'm-mira');
    await page.locator('#psDone').click();               // nichts neu editiert — die alte Marke reicht
    await expect.poll(() => oks.flat().some(r => r.id === 'm-mira' && r.goal === 9)).toBe(true);
    await expect.poll(() => page.evaluate(fam =>
      JSON.parse(localStorage.getItem('haushalt.pendmemb:' + fam) || '[]'), FAM)).not.toContain('m-mira');
  });

  test('Wochenziel ÜBERLEBT den nächsten Abgleich: Server hat es, Pull darf es nicht mehr ausblenden (v4.69.4)', async ({ context, page }) => {
    // Live-Vorfall 26.07.: goal fehlte in der Pull-Spaltenliste — der Server
    // BEHIELT jedes Ziel, aber jeder Abgleich ersetzte state.members durch
    // ziellose Zeilen («erst gespeichert, dann weg», nur die frischeste
    // Aenderung schien zu halten). Der Mock respektiert seit v4.69.4 select=,
    // darum FAENGT dieser Test die alte Spaltenliste (negativ geprueft).
    const srv = [{ id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', admin: false, assisted: false, goal: null }];
    await mockBackend(context, {
      famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }],
      memberRows: () => srv });
    await context.route(`${SB}/rest/v1/members**`, route => {
      const req = route.request();
      if (req.method() === 'POST') {
        for (const r of [].concat(JSON.parse(req.postData() || '[]')))
          Object.assign(srv.find(x => x.id === r.id) || {}, { goal: r.goal });   // Server uebernimmt das Ziel
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fallback();
    });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(600);
    await page.evaluate(() => document.getElementById('openMembers').click());
    await openPerson(page, 'm-mira');
    await page.locator('#psGoal').fill('8');
    await page.locator('#psDone').click();
    await expect(page.locator('.prow[data-pid="m-mira"] .assistbadge', { hasText: '🎯8' })).toBeVisible();
    // ZWEI Abgleiche spaeter (Schutzschild-Fenster vorbei) muss das Ziel noch da sein
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForTimeout(700);
    }
    await expect(page.locator('.prow[data-pid="m-mira"] .assistbadge', { hasText: '🎯8' })).toBeVisible();
    await openPerson(page, 'm-mira');
    await expect(page.locator('#psGoal')).toHaveValue('8');
    await page.locator('#psDone').click();
  });

  test('Sync-Details: das Geraet zeigt Version, Marken, letzten Push-Fehler und lokale Ziele (v4.69.4)', async ({ context, page }) => {
    await mockBackend(context, {
      famRows: () => [{ family_id: FAM, name: 'Testhaushalt', beta: true }],
      memberRows: () => [{ id: 'm-mira', name: 'Mira', color: '#3E6BD6', family_id: FAM, url_slug: 'slugmira1', goal: 8 }] });
    // ein haengender Push-Fehler + eine offene Marke aus einer frueheren Sitzung
    await context.addInitScript(fam => {
      localStorage.setItem('haushalt.lastpusherr:' + fam, JSON.stringify({ at: Date.now() - 60000, msg: 'upsert members → 400' }));
    }, FAM);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(600);
    await page.locator('#openSettings').click();
    await page.locator('#setSyncDiag').click();
    const sheet = page.locator('#syncDiagSheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Fairli ');
    await expect(sheet).toContainText('🧪');                          // Beta sichtbar
    await expect(sheet).toContainText('upsert members → 400');       // der Fehler verweht nicht mehr
    await expect(sheet).toContainText('Mira:8');                     // lokale Ziel-Wahrheit
  });

  // ---------- v4.78.0: Verschiebe-Toast nach Verlaufs-Edit ----------

  test('Datums-Edit im Verlauf bestätigt den Landetag als Toast; reiner Namens-Edit schweigt (v4.78.0)', async ({ context, page }) => {
    const entry = { id: 'l-mv1', chore_id: null, chore_name: 'Tonne rausstellen', chore_note: '',
      member_id: 'm-mira', member_name: 'Mira', points: 1,
      done_at: new Date().toISOString(), created_at: new Date().toISOString(), family_id: FAM };
    await mockBackend(context, { logRows: () => [entry] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    // 1) Nur der Name geaendert → KEIN Verschiebe-Toast
    await page.locator('[data-editlog]').first().click();
    await page.locator('#lName').fill('Tonne raus und zurück');
    await page.locator('#saveLog').click();
    await page.waitForTimeout(150);
    await expect(page.locator('#toast')).not.toContainText('Verschoben');
    // 2) Zeit innerhalb HEUTE geaendert → Toast nennt «Heute» + Uhrzeit, OHNE Wochen-Warnung
    await page.locator('[data-editlog]').first().click();
    const v = await page.locator('#lTime').getAttribute('data-v');
    // 12 h Abstand, gleicher Kalendertag: immer >1 min Delta (Sub-Minuten-
    // Regel greift nie), immer noch «Heute».
    const nh = (parseInt(v.slice(11, 13), 10) + 12) % 24;
    const nt = String(nh).padStart(2, '0') + v.slice(13, 16);
    await setPickerTime(page, v.slice(0, 10), nh, parseInt(v.slice(14, 16), 10));
    await expect(page.locator('#lTime .tfv')).toContainText(nt);   // Feld zeigt die Wahl an
    await page.locator('#saveLog').click();
    await expect(page.locator('#toast')).toContainText('Verschoben auf Heute, ' + nt);
    await expect(page.locator('#toast')).not.toContainText('Diese Woche');
  });

  test('Datums-Edit, der die Woche verlässt, WARNT — genau der 27.07.-Fall «Eintrag verschwunden» (v4.78.0)', async ({ context, page }) => {
    const entry = { id: 'l-mv2', chore_id: null, chore_name: 'Tonne rausstellen', chore_note: '',
      member_id: 'm-mira', member_name: 'Mira', points: 1,
      done_at: new Date().toISOString(), created_at: new Date().toISOString(), family_id: FAM };
    await mockBackend(context, { logRows: () => [entry] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await page.locator('[data-editlog]').first().click();
    // 8 Tage zurueck liegt IMMER vor weekStart() (Montag), egal an welchem
    // Wochentag der Test laeuft — kein weekSafeAgo noetig, der Rand ist der Punkt.
    const d = new Date(Date.now() - 8 * 86400e3), p = x => String(x).padStart(2, '0');
    await setPickerTime(page, `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, 11, 11);
    await page.locator('#saveLog').click();
    await expect(page.locator('#toast')).toContainText('Verschoben auf');
    await expect(page.locator('#toast')).toContainText('11:11');
    await expect(page.locator('#toast')).toContainText('nicht mehr in «Diese Woche»');
    // Der Eintrag ist NICHT weg: er steht jetzt unter seinem neuen Tages-Header
    await expect(page.locator('#list')).toContainText('Tonne raus');
  });

  test('Eigener Zeit-Picker: Fairli-Anatomie, kein Clear; × verwirft die Auswahl restlos (v4.82.0)', async ({ context, page }) => {
    // Ersetzt den v4.80.0-Clear-Vertrag: der native Picker (samt Clear) ist
    // weg. Neuer Vertrag: das Picker-Sheet folgt der Sheet-Anatomie (× oben
    // rechts, EINE Primaeraktion «Übernehmen»), kennt keinen Clear-Pfad, und
    // NICHTS aendert sich ohne Übernehmen — done_at bleibt byte-identisch.
    const entry = { id: 'l-cl1', chore_id: null, chore_name: 'Tonne rausstellen', chore_note: '',
      member_id: 'm-mira', member_name: 'Mira', points: 1,
      done_at: new Date().toISOString(), created_at: new Date().toISOString(), family_id: FAM };
    await mockBackend(context, { logRows: () => [entry] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await page.locator('[data-editlog]').first().click();
    const orig = await page.locator('#lTime').getAttribute('data-v');
    await page.locator('#lTime').click();
    await expect(page.locator('#timeSheet')).toBeVisible();
    // Anatomie: ×, Chips, Kalender, Zeit, genau EINE Primaeraktion — kein Clear
    await expect(page.locator('#timeSheet #tpClose')).toBeVisible();
    await expect(page.locator('#timeSheet #tpApply')).toHaveText('Übernehmen');
    await expect(page.locator('#timeSheet')).not.toContainText('Clear');
    await expect(page.locator('#timeSheet .day.sel')).toHaveCount(1);
    // Anderen Tag ANTIPPEN, dann × → verworfen, Feld unveraendert
    await page.locator('#timeSheet #tpYest').click();
    await page.locator('#timeSheet #tpClose').click();
    await expect(page.locator('#timeSheet')).toBeHidden();
    await expect(page.locator('#lTime')).toHaveAttribute('data-v', orig);
    await page.locator('#saveLog').click();
    await page.waitForTimeout(150);
    await expect(page.locator('#toast')).not.toContainText('Verschoben');   // kein Verschiebe-Toast
    const done = await page.evaluate(fam =>
      JSON.parse(localStorage.getItem('haushalt.v2:' + fam)).log.find(e => e.id === 'l-cl1').done_at, FAM);
    expect(done).toBe(entry.done_at);                      // Zeit byte-identisch erhalten
  });

  test('Zeit-Picker: Gestern-Chip + Übernehmen — Feld sagt «Gestern», Speichern meldet den Umzug (v4.82.0)', async ({ context, page }) => {
    const entry = { id: 'l-yd1', chore_id: null, chore_name: 'Tonne rausstellen', chore_note: '',
      member_id: 'm-mira', member_name: 'Mira', points: 1,
      done_at: new Date().toISOString(), created_at: new Date().toISOString(), family_id: FAM };
    await mockBackend(context, { logRows: () => [entry] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await page.locator('[data-editlog]').first().click();
    await page.locator('#lTime').click();
    await page.locator('#timeSheet #tpYest').click();
    await expect(page.locator('#timeSheet #tpYest')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#tpApply').click();
    await expect(page.locator('#lTime .tfv')).toContainText('Gestern');
    await page.locator('#saveLog').click();
    // Montags traegt der Toast zusaetzlich die Wochen-Warnung — beides faengt der Praefix
    await expect(page.locator('#toast')).toContainText('Verschoben auf Gestern');
  });

  // ---------- v4.88.0: Geräte-Herzschlag ----------

  test('Geräte-Herzschlag: Boot meldet Version write-only, 1×/Tag, Versionswechsel sofort, Familien-Link ohne member_id (v4.88.0)', async ({ context, page }) => {
    const beats = [];
    await mockBackend(context);
    await context.route(`${SB}/rest/v1/devices**`, route => {
      beats.push(JSON.parse(route.request().postData() || '[]')[0]);
      return route.fulfill({ status: 201, body: '' });
    });
    // 1) Persoenlicher Link → member_id gesetzt, Version = Live-Version
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    await expect.poll(() => beats.length).toBe(1);
    expect(beats[0].app_version).toBe(APP_VERSION);
    expect(beats[0].member_id).toBe('m-mira');
    expect(beats[0].device_id).toBeTruthy();
    expect(beats[0].family_id).toBe(FAM);
    // 2) Gleicher Tag, gleiche Version: Reload schlaegt NICHT erneut
    await page.reload();
    await page.waitForTimeout(600);
    expect(beats.length).toBe(1);
    // 3) Versionswechsel: alte Marke → naechster Boot meldet sofort, GLEICHE device_id
    await page.evaluate(() => localStorage.setItem('haushalt.devbeat',
      new Date().toISOString().slice(0, 10) + '|4.0.0'));
    await page.reload();
    await expect.poll(() => beats.length).toBe(2);
    expect(beats[1].device_id).toBe(beats[0].device_id);
    // 4) Familien-Link (neuer Kontext-Zustand nicht noetig: Storage geleert): member_id null
    await page.evaluate(() => { localStorage.removeItem('haushalt.devbeat'); });
    await page.goto(`${BASE}/f/${FAM}`);
    await expect.poll(() => beats.length).toBe(3);
    expect(beats[2].member_id).toBe(null);
  });

  test('Geräte-Herzschlag: Scheitern setzt KEINE Marke — der nächste Boot versucht es erneut (v4.88.0)', async ({ context, page }) => {
    // Migration noch nicht angewandt / offline: 404 auf devices. Der Boot
    // darf davon nichts merken, und die Marke bleibt frei fuer den Retry.
    let calls = 0;
    await mockBackend(context);
    await context.route(`${SB}/rest/v1/devices**`, route => { calls++; return route.fulfill({ status: 404, body: '' }); });
    await page.goto(`${BASE}/f/${FAM}`);
    await expect.poll(() => calls).toBe(1);
    await expect(page.locator('.tabs')).toBeVisible();          // Boot unbeeindruckt
    const mark = await page.evaluate(() => localStorage.getItem('haushalt.devbeat'));
    expect(mark).toBe(null);                                    // kein Erfolg, keine Marke
    await page.reload();
    await expect.poll(() => calls).toBe(2);                     // Retry am naechsten Boot
  });

  test('Einstellungen zeigen «Letzter Abgleich» — stilles Scheitern sieht nie wieder wie Abwesenheit aus (v4.61.0)', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await page.waitForTimeout(600);
    await page.locator('#openSettings').click();
    await expect(page.locator('#syncInfo')).toContainText('Letzter Abgleich');
    await expect(page.locator('#syncInfo')).toContainText('gerade eben');
  });
});


// Chrome auf iOS (CriOS): eigener UA, gleiche WebKit-Engine. Der Install
// selbst ist ein OS-Dialog (nicht automatisierbar); getestet wird, dass die
// App unter CriOS identisch iOS-behandelt wird: Route-Handoff, KEIN Manifest
// (Parse-Zeit-Falle), Anleitung sichtbar.
test.describe('Chrome auf iOS (CriOS-UA)', () => {
  test.use({ userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.55 Mobile/15E148 Safari/604.1' });

  test('CriOS zählt als iOS: Handoff ok, kein Manifest, Anleitung rendert', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page).toHaveURL(new RegExp(`${BASE}/f/${FAM}$`));
    // IS_IOS greift über "iPhone" im CriOS-UA → nie ein Manifest-Link
    expect(await page.locator('link[rel="manifest"]').count()).toBe(0);
    await page.locator('#openShareTop').click();
    const inst = page.locator('#shareSheet details.install');
    await inst.locator('summary').click();
    await expect(inst.locator('.plat h4', { hasText: 'iPhone' })).toBeVisible();
    // "dein Gerät"-Badge sitzt auf der iOS-Sektion, nicht auf Android
    await expect(inst.locator('.plat').first().locator('.pbadge')).toHaveCount(1);
  });
});

// Echte Service-Worker-Tests: die globale Config blockt SWs für Determinismus —
// HIER ist die eine, bewusste Ausnahme (Chromium-only; Netz bleibt vollständig
// gemockt/lokal: SW-eigene Fetches gehen an den Pages-Mimic, Supabase-Calls der
// Seite laufen weiter durch context.route).
test.describe('Service Worker (echt)', () => {
  test.use({ serviceWorkers: 'allow' });

  test('News-Banner-Klick FÜHRT zur echten updates.html — SW-Shell-Regel kapert sie nicht (Live-Bug v4.39.1)', async ({ context, page, browserName }) => {
    // Der Bug: die SW-Navigationsregel beantwortete JEDE /chores/-Navigation
    // mit der App-Shell — der Banner-Tap lud scheinbar nur die App neu.
    // Reproduzierbar nur MIT aktivem Service Worker → Chromium-only
    // (WebKit + Playwright + SW-Netzwerk-Interception ist nicht verlässlich).
    test.skip(browserName !== 'chromium', 'SW-Navigationsverhalten nur in Chromium prüfbar');
    await mockBackend(context);
    // 1) SW registriert sich jetzt auch auf f/-Routen (absoluter Pfad —
    //    das relative 'sw.js' lief seit der Hash→Pfad-Migration still ins 404;
    //    dieser Test wacht mit serviceWorker.ready auch darüber)
    await page.goto(`${BASE}/f/${FAM}`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    // 2) Wiederkehrer-Marke setzen und neu laden — Navigation ist jetzt
    //    SW-kontrolliert (die f/-Route bekommt korrekt die Shell)
    await page.evaluate(() => localStorage.setItem('haushalt.seenver', '4.0.0'));
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('#newsBar')).toBeVisible();
    // 3) Banner-Tap öffnet neuen Tab — und der zeigt die ECHTE Seite
    const [pop] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('#newsBarLink').click(),
    ]);
    await pop.waitForLoadState();
    await expect(pop).toHaveURL(/\/chores\/updates\.html$/);
    await expect(pop).toHaveTitle(/Was ist neu/);       // updates.html …
    await expect(pop.locator('#apphead')).toHaveCount(0); // … NICHT die App-Shell
    // 4) Banner markiert gesehen und verschwindet
    await expect(page.locator('#newsBar')).toBeHidden();
  });
});
