// Fairli Tier-1 regression tests.
// Every test here corresponds to a bug that actually shipped once.
// Supabase is fully mocked — tests never touch production data.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __i18nDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'i18n');

const FAM = 'testfam-abc123';
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
async function mockBackend(context, { logRows = () => LOG, memberRows = null } = {}) {
  // Standard-Persona: WIEDERKEHRER — das Onboarding «Zugriff sichern»
  // (v4.45.0, modal!) gilt als gesehen, sonst blockierte es jeden Test.
  // Onboarding-Tests entfernen die Marke gezielt.
  await context.addInitScript(fam => {
    try {
      if (!sessionStorage.getItem('fairli.obPersona.off')) {
        localStorage.setItem('haushalt.onboard:' + fam + ':a', '1');
        localStorage.setItem('haushalt.onboard:' + fam + ':u', '1');
      }
    } catch {}
  }, FAM);
  await context.route('**://fonts.googleapis.com/**', r => r.abort());
  await context.route('**://fonts.gstatic.com/**', r => r.abort());
  await context.route('**://gen.pollinations.ai/**', r => r.abort());
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
    const body =
      url.includes('/rest/v1/members') ? (memberRows ? memberRows() : MEMBERS) :
      url.includes('/rest/v1/chores')  ? CHORES :
      url.includes('/rest/v1/log')     ? logRows() :
      url.includes('/rest/v1/families') ? FAMILIES : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

// Onboarding-Persona auch fuer Tests mit EIGENEN Routen (ohne mockBackend):
// sonst blockiert das «Zugriff sichern»-Modal (v4.45.0) jeden Klick.
async function suppressOnboarding(context) {
  await context.addInitScript(fam => {
    try {
      localStorage.setItem('haushalt.onboard:' + fam + ':a', '1');
      localStorage.setItem('haushalt.onboard:' + fam + ':u', '1');
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

  test('Admin-Link: Familien-Block + QR-Bildunterschriften', async ({ context, page }) => {
    await mockBackend(context);
    await page.goto(`${BASE}/f/${FAM}`);
    await expect(page.locator('html')).not.toHaveClass(/userlink/);
    await expect(page.locator('#openMembers')).toBeVisible();
    await page.locator('#openShareTop').click();
    const sheet = page.locator('#shareSheet');
    await expect(sheet.locator('.shname', { hasText: 'Admin-Link' })).toBeVisible();
    await expect(sheet.locator('.subnote', { hasText: 'Gibt vollen Zugriff auf alle Mitglieder' })).toBeVisible();
    // Onboarding v4.44.0: Sichern-Warnung am Admin-Link, Erklärung an den persönlichen Links
    await expect(sheet.locator('.savenote')).toContainText('Ohne ihn verliert ihr den Zugriff');
    await expect(sheet.locator('.subnote', { hasText: 'Verschick sie an deine Mitbewohner oder Familie' })).toBeVisible();
    // QR aufklappen → Caption benennt den Inhalt (v4.19.0)
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
    expect(adminMe).toBeNull();   // Janas Besuch hat die Admin-Identitaet NICHT gesetzt
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

  test('Hash allein rettet die Route (Query + sessionStorage weg — Mikas Befund)', async ({ context, page }) => {
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
    // Frisches Geraet, Icon mit eingebackener index.html — exakt Mikas Zustand
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

  test('Manifest-Regel: nie auf iOS, nie auf persönlichen Links, ja im Android-Familienkontext (v4.20.0)', async ({ context, page, browserName }) => {
    await mockBackend(context);
    // Familien-Kontext
    await page.goto(`${BASE}/f/${FAM}`);
    const famCount = await page.locator('link[rel="manifest"]').count();
    if (browserName === 'webkit') expect(famCount).toBe(0);   // iOS-Profil: NIE (Parse-Zeit-Falle!)
    else expect(famCount).toBe(1);                            // Android: injiziert
    // Persönlicher Link: auf KEINER Plattform
    await page.goto(`${BASE}/f/${FAM}/u/slugmira1`);
    expect(await page.locator('link[rel="manifest"]').count()).toBe(0);
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
    const chrisRow = { id: 'l-c', chore_id: 'c-1', chore_name: 'Müll rausbringen', chore_note: null,
      member_id: 'm-chris', member_name: 'Timon', points: 2, done_at: '2026-07-10T09:00:00Z', family_id: FAM };
    await mockBackend(context, { logRows: () => [...serie, chrisRow] });
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    await expect(page.locator('.entry')).toHaveCount(2);            // Janas Serie + Timon
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

  test('Verlauf-Löschen: Undo stellt wieder her, DELETE erst nach dem Fenster (v4.24.0)', async ({ context, page }) => {
    test.setTimeout(30000);   // enthaelt bewusst das volle 5s-Undo-Fenster
    let deletes = 0;
    await mockBackend(context);
    await context.route(`${SB}/rest/v1/log**`, r =>
      r.request().method() === 'DELETE' ? (deletes++, r.fulfill({ status: 204, body: '' })) : r.fallback());
    await page.goto(`${BASE}/f/${FAM}`);
    await page.getByRole('tab', { name: 'Verlauf' }).click();
    const entry = page.locator('.entry', { hasText: 'Müll rausbringen' });
    await entry.click();
    await page.locator('#logSheet #delLog').click();
    await expect(page.locator('.entry')).toHaveCount(0);            // lokal sofort weg
    // Undo im Fenster: rein lokal, KEIN DELETE ging raus
    await page.locator('#toast .tact', { hasText: 'Rückgängig' }).click();
    await expect(page.locator('.entry', { hasText: 'Müll rausbringen' })).toHaveCount(1);
    expect(deletes).toBe(0);
    // Pull darf die wiederhergestellte Zeile nicht fressen (pendingDeletes bereinigt)
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(400);
    await expect(page.locator('.entry', { hasText: 'Müll rausbringen' })).toHaveCount(1);
    // Zweiter Löschvorgang, KEIN Undo → DELETE nach Ablauf des Fensters
    await entry.click();
    await page.locator('#logSheet #delLog').click();
    await expect(page.locator('.entry')).toHaveCount(0);
    expect(deletes).toBe(0);                                        // noch im Fenster
    await page.waitForTimeout(5300);
    expect(deletes).toBeGreaterThan(0);                             // jetzt committet
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
    await sh.locator('#lTime').fill('2026-07-08T08:30');
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
    expect(logQueries.filter(u => !u.includes('or=')).length).toBe(1); // nur EIN Vollabgleich
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
    // Tabs kleben bei 0 und sind DECKEND (Kacheln laufen nicht in die Pills)
    const tabs = await page.locator('.tabs').boundingBox();
    expect(Math.abs(tabs.y)).toBeLessThanOrEqual(1);
    const bg = await page.locator('.tabs').evaluate(el => getComputedStyle(el).backgroundColor);
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
    // Empfänger-Perspektive: persönlicher Link (Janas geteilter Link)
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
    await page.locator('#addMember').click();
    await page.locator('#memberRows .mrow').last().locator('input[type=text]').fill('Nova');
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
    const janaRow = page.locator('#memberRows .mrow', { has: page.locator('input[type=text]') }).filter({ hasText: '' }).first();
    const inputs = page.locator('#memberRows .mrow input[type=text]');
    const n = await inputs.count();
    for (let i = 0; i < n; i++) {
      if ((await inputs.nth(i).inputValue()) === 'Mira') { await inputs.nth(i).fill('Janine'); break; }
    }
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
    await expect(sheet.locator('.shname', { hasText: 'Admin link' })).toBeVisible();
    // Familien-Link ist unmissverständlich als Admin-Link markiert (v4.43.1)
    await expect(sheet.locator('.subnote', { hasText: 'Gives full access to all members' })).toBeVisible();
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
    await mockBackend(context, { memberRows: () => ['Alessandra','Bartholomäus','Christiane','Dominique','Emmanuelle','Friedrich'].map((n, i) =>
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
    const familyBtn = page.locator('.shrow.shfam [data-share]');   // die Familien-Zeile, nicht Mitglieder-Zeilen
    await expect(familyBtn).toHaveAttribute('data-share', new RegExp('^https?://[^/]+/fairli/f/' + FAM + '$'));
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
      if (sessionStorage.getItem('cristina-injected')) return;    // nur Boot 1 praeparieren
      sessionStorage.setItem('cristina-injected', '1');
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
          const i = (store[table] || []).findIndex(y => y.id === x.id || (table === 'families' && y.family_id === x.family_id));
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
