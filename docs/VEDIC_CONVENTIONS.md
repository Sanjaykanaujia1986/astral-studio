# Vedic (Jyotiṣa) conventions

> Written **before** the implementation, as the brief requires. Every rule the
> module applies is stated here with its ambiguity, because Jyotiṣa is not one
> system but several, and software that hides which one it chose is unusable
> for serious work.

A sidereal Western chart is **not** a Vedic chart. Sidereal longitudes are a
prerequisite, not the system. What follows is what the module adds on top, and
what it deliberately does not claim.

---

## 1. Ayanamsha

**Default: Lahiri (Chitrapakṣa).** Configurable to any ayanamsha the engine
supports — Raman, Krishnamurti (KP), Yukteshwar, True Chitrapaksha,
Fagan/Bradley, or a custom offset.

This is the single largest source of disagreement between two Vedic programs.
Lahiri and Raman differ by roughly 0.9° in the modern era — enough to move a
planet across a pada boundary, and occasionally across a sign. The ayanamsha in
force is recorded with every chart and shown in the UI; a reading produced
under one must not be compared with a reading produced under another.

## 2. Lunar nodes

**Default: mean (madhyama) Rahu and Ketu.**

This differs from the Western default and from Swiss Ephemeris's. Classical
tables and most Indian practice use the mean node; the true (sphuṭa) node
oscillates about it by up to ~1.5°, which is nearly half a pada.

Ketu is always derived from **its own** Rahu — mean Ketu from mean Rahu — never
from the other variety. See `docs/ASTRONOMY_NOTES.md`.

## 3. Rāśi (D-1)

Sidereal longitude mapped to the twelve signs of 30° each, counted from
sidereal 0° Aries.

**Houses are whole-sign (bhāva = rāśi).** The sign containing the lagna is the
first house, and each subsequent sign is the next house. This is the dominant
North Indian convention and the one classical texts assume.

Not implemented: bhāva-chalita (cusp-based houses, where a planet can sit in
one rāśi and a different bhāva). The two genuinely disagree about house
placement, and offering only one is honest; offering both without saying which
is being shown is not.

## 4. Nakṣatra and pāda

27 nakṣatras of **13°20'** (800'), each divided into 4 pādas of **3°20'** (200').

Pāda is defined so that it coincides with the navāṁśa: the pāda index of a
longitude and its navāṁśa sign are the same division of the zodiac. The module
computes one from the other rather than from two formulae that could drift.

Abhijit is **not** included. The 28-nakṣatra scheme overlaps Uttarāṣāḍhā and
Śravaṇa and is used only in specific muhūrta contexts; mixing it into a
27-nakṣatra pāda scheme would corrupt both the pādas and the daśā.

## 5. Vargas (divisional charts)

Each varga has **its own** mapping rule. A single formula applied to all of
them — `floor(longitude / (30/n)) mod 12` — happens to be correct for D-9 and
is wrong for most others. The ones implemented, with their rules:

| Varga | Division | Rule |
|---|---|---|
| **D-1** Rāśi | 30° | The sign itself. |
| **D-2** Horā | 15° | Parāśarī: odd signs — first half Leo, second half Cancer; even signs — first half Cancer, second half Leo. Only two signs ever occur. |
| **D-3** Drekkāṇa | 10° | First third → the sign itself; second → 5th from it; third → 9th from it. |
| **D-9** Navāṁśa | 3°20' | Count continuously from Aries: `floor(longitude / 3°20') mod 12`. Equivalent to the classical rule that movable signs start from themselves, fixed from the 9th, dual from the 5th. |
| **D-10** Daśāṁśa | 3° | Odd signs — count from the sign itself; even signs — count from the 9th from it. |
| **D-12** Dvādaśāṁśa | 2°30' | Count from the sign itself. |

Not implemented: D-4, D-7, D-16, D-20, D-24, D-27, D-30, D-40, D-45, D-60. Each
needs its own rule stated and checked; D-30 (triṁśāṁśa) in particular is not a
simple division at all, and several have competing Parāśarī and Jaiminī forms.
They are absent rather than approximated.

## 6. Viṁśottarī daśā

The 120-year cycle. Lords in order, with their periods:

| Lord | Years | | Lord | Years |
|---|---:|---|---|---:|
| Ketu | 7 | | Rāhu | 18 |
| Venus | 20 | | Jupiter | 16 |
| Sun | 6 | | Saturn | 19 |
| Moon | 10 | | Mercury | 17 |
| Mars | 7 | | **Total** | **120** |

**Starting lord** is the lord of the Moon's natal nakṣatra, the sequence
repeating every nine nakṣatras from Aśvinī (Ketu).

**Balance at birth** is the *unelapsed* portion of the Moon's nakṣatra times
the lord's period — so a Moon exactly at the start of its nakṣatra gives the
full period, and one at the end gives almost none.

### The year length — the convention that matters most

A "year" here is **365.25 days** by default (the Julian year) — the value the
reference horoscope software prints with, confirmed against 1,700+ of its
printed daśā dates. Also selectable:

- **365.2425** (Gregorian mean year)
- **360** (sāvana) — the classical 360-day reckoning
- **365.2422** (tropical)

This is not a rounding detail. Over a 120-year cycle, 365.25 against 365.2425
diverges by about **a day**, and across a mahādaśā boundary two programs using
different year lengths will disagree about the date by days. The choice is
recorded with the result, and the UI shows it.

### Where the clock starts

`anchor: 'civilDate'` (the UI default) starts the daśā clock at **00:00 local
time on the birth date**, not at the birth moment. That is what the reference
software does: with it, 99 % of its printed Viṁśottarī and Aṣṭottarī dates are
reproduced to the day (the rest are period ends within minutes of midnight).
`anchor: 'birthMoment'` is available for anyone who prefers the instant.

Balances are written as years / months / days on the **360-day reckoning**
(12 months of 30 days), as printed horoscopes give them.

### Levels and systems

Every level divides its parent in the system's proportions, starting from the
parent's own lord, so one rule gives antar, pratyantar, sūkṣma and prāṇa
daśās. Sub-periods are generated on demand.

| System | Years | Start |
|---|---:|---|
| Viṁśottarī | 120 | lord of the nakṣatra, nine-fold from Aśvinī (Ketu) |
| Aṣṭottarī | 108 | eight lords (no Ketu); nakṣatras from Ārdrā in groups of 4,3,4,3,3,3,4,3, elapsed part measured across the whole group (Abhijit not used) |
| Yoginī | 36 | (nakṣatra number + 3) mod 8, counted from Maṅgalā |

Any body (or the lagna) can stand in for the Moon — the "daśā from Lagna /
Sun / …" pages of printed reports.

**Known differences from the reference software.** Its Yoginī dates fall
1–3 days from the standard computation, in a pattern no single year length or
rounding rule reproduces, so the standard rule is kept. Its dates after
28 February 2100 are one day early (it treats 2100 as a leap year). For a
longitude in Śravaṇa its "Aṣṭottarī from Lagna / Sun / Mercury" pages use an
Abhijit-dependent split that is not documented; the Moon-based Aṣṭottarī
agrees.

## 6a. Śani sāḍe-sātī and slow-planet transits

Sign stays come from solved sidereal ingresses, retrograde re-entries kept.

- **Sāḍe-sātī**: Saturn in the 12th, 1st or 2nd sign from the natal Moon.
  **Panautī (ḍhaiyā)**: the 4th or 8th. A retrograde excursion out of the zone
  and back joins the same spell. The spell running at birth is reported from
  the start of the sign stay that contains the birth.
- **Pāya**: the transiting Moon's house from the natal Moon at the moment
  Saturn enters — 1/6/11 gold, 2/5/9 silver, 3/7/10 copper, 4/8/12 iron.
- **Saturn over the Moon**: the dates Saturn reaches the Moon's whole degree − 1
  and leaves its whole degree + 1.

Checked against 16 printed spells in two reference reports: every one agrees,
one end landing 14 minutes after midnight.

---

## 7. Pañcāṅga

The five limbs, all reckoned **from sunrise** at the chart's location.

| Limb | Definition |
|---|---|
| **Tithi** | `ceil(norm360(Moon − Sun) / 12°)`, 1–30. |
| **Vāra** | Weekday, changing at **sunrise**, not midnight. |
| **Nakṣatra** | The Moon's nakṣatra. |
| **Yoga** | `ceil(norm360(Moon + Sun) / 13°20')`, 1–27. |
| **Karaṇa** | Half a tithi, 1–60 per lunar month; 7 repeating (Bava…Viṣṭi) and 4 fixed (Śakuni, Catuṣpada, Nāga, Kiṁstughna). |

### Sunrise

Computed by Swiss Ephemeris `swe_rise_trans`, not approximated.

- **Disc centre or upper limb?** The module uses the **upper limb with
  refraction**, which is the ordinary civil definition of sunrise and the one
  most pañcāṅga makers use. Disc-centre sunrise differs by roughly 2–4 minutes
  at mid latitudes — enough to change the vāra for a birth in that window.
- Atmospheric pressure 1013.25 mbar, temperature 15 °C, altitude 0 m.

**Polar caveat.** Above the Arctic and Antarctic circles the Sun may not rise or
set for days. When no sunrise exists for the date, the module reports the limbs
that do not need one (tithi, nakṣatra, yoga, karaṇa are longitude-based) and
explicitly marks **vāra as unavailable** rather than substituting midnight.

### Tithi at a moment vs tithi of a day

A tithi is a *moment-by-moment* quantity; "today's tithi" conventionally means
the one in force **at sunrise**. The module reports both, labelled, because
conflating them is how a pañcāṅga ends up a day out.

---

## 9. Aṣṭakūṭa matching, Maṅgala doṣa and yogas

**Kūṭas** (boy's Moon, girl's Moon): Varṇa 1, Vaśya 2, Tārā 3, Yoni 4,
Graha maitrī 5, Gaṇa 6, Bhakūṭa 7, Nāḍī 8 — 36 in all.

- Vaśya by sign, with the classical halves: Dhanu 0–15° Mānava, 15–30°
  Catuṣpada; Makara 0–15° Catuṣpada, 15–30° Jalacara. (The reference software
  swaps both halves.)
- Bhakūṭa: 2/12, 5/9 and 6/8 score 0, everything else 7; the doṣa is
  cancelled (7) when the two sign lords are the same planet or mutual natural
  friends. (The reference software prints 6s and 1s that change between
  nakṣatras of the same pair of signs — no published rule produces them.)
- Graha maitrī from natural relationships: same lord or mutual friends 5,
  friend–neutral 4, neutral–neutral 3, friend–enemy 1, neutral–enemy 0.5,
  enemies 0.

**Maṅgala doṣa**: Mars in the 1st, 2nd, 4th, 7th, 8th or 12th house, reported
from the lagna, the Moon and Venus.

**Yogas** are tested against their stated conditions. The lunar and solar
yogas count the five tārāgrahas only (the Sun is excluded from the Moon's);
when counting Rāhu/Ketu would change a result, it says so.

## 10. KP, aṣṭakavarga and ṣaḍbala

**KP.** Krishnamurti ayanāṁśa, Placidus cusps, mean nodes unless the chart uses
true nodes. Each 13°20′ star is split into nine subs in Viṁśottarī proportion
starting from the star's own lord, and each sub again for the sub-sub lord. A
planet sits in the house whose cusp arc holds it, and is also counted in the
next house when less than 1° before its cusp (the reference reports put the cut
between 58.6′ and 81′). Rāhu and Ketu own their sign lord's houses. A planet
signifies the houses that it and its star lord occupy and own. Ruling planets
are taken at birth, in the order lagna sign lord, lagna star lord, Moon sign
lord, day lord (civil date), Moon star lord.

**Aṣṭakavarga.** Parāśara's bindu tables for the seven planets and the lagna.
The sarvāṣṭakavarga adds only the seven planets (always 337). Trikoṇa śodhana
subtracts the smallest of each triad (equal values all clear); ekādhipatya
śodhana treats the five pairs of signs with one lord by occupation. Piṇḍas use
the rāśi multipliers 7 10 8 4 10 5 7 8 9 5 11 12 and graha multipliers Sun 5,
Moon 5, Mars 8, Mercury 5, Jupiter 10, Venus 7, Saturn 5.

**Ṣaḍbala** follows Bṛhat Parāśara in virūpas:

- Sthāna: uccha, saptavargaja (D1 D2 D3 D7 D9 D12 D30 with compound
  friendship; mūlatrikoṇa only in D1), ojayugma, kendra, drekkāṇa.
- Dig from the Śrīpati bhāva madhyas.
- Kāla: nathonnata, pakṣa, tribhāga, abda, māsa, vāra, horā, ayana (BPHS krānti
  table). Benefics are Jupiter, Venus, the Moon 72° or more from the Sun, and
  Mercury unless it shares a sign with a malefic; the Moon's pakṣa is doubled.
- Ceṣṭā from the mean and true longitudes; the Sun takes its ayana bala and
  the Moon its pakṣa bala.
- Naisargika, and dṛk from sphuṭa dṛṣṭi with the special aspects of Mars,
  Jupiter and Saturn.

Where the reference reports cannot be reproduced:

- **Nathonnata**: computed from local mean time; the reports' divā value fits
  none of their printed times (up to 0.3 virūpa apart).
- **Horā**: one-hour horās from sunrise beginning with the day lord. The
  reports print a lord four horās away in both charts, which no sunrise or
  midnight convention produces.
- **Abda/māsa**: Kali ahargaṇa with 360- and 30-day periods; abda matches both
  reports, māsa one of the two.
- **Ceṣṭā**: modern mean elements, where the reports use Sūrya-Siddhānta means;
  Mars, Jupiter and Saturn agree within 0.7 virūpa, Venus within 0.9 and
  Mercury within about 5.
- **Yuddha bala** is not applied; a planetary war (Mars–Saturn within 1°) is
  flagged instead.

## 11. Varṣaphal and progressions

The varṣa begins when the sidereal Sun returns to its natal longitude (solved
to 1e-9°). The varṣa lagna is cast for the birth place. Muntha starts in the
natal lagna sign and moves one sign per completed year.

Mudda daśā is Viṁśottarī from the varṣa Moon. Two conventions:

- **Printed** (default): counted from local midnight of the return date. The
  first lord receives the Moon's balance of a 365.25-day share, rounded to
  whole days. The next eight lords receive fixed whole-day periods: Ketu 22,
  Venus 61, Sun 18, Moon 30, Mars 21, Rāhu 55, Jupiter 49, Saturn 58,
  Mercury 52. The first lord then returns for the rest of its period. This
  makes a 366-day cycle. Every middle period in the reference reports has
  exactly these lengths.
- **Proportional**: every lord receives years/120 of the actual solar year,
  ending at the next return.

The reference reports print return moments 0–28 minutes earlier than the true
return. The error varies from year to year, which points to a low-precision
solar theory. Their return dates still agree for 199 of 200 years. The early
moment can shift the varṣa lagna by a few degrees and a mudda date by one or two
days (64% of printed mudda dates are exact).

**Progressions** are sāyana secondary progressions: tropical positions one day
after birth for each year of life, the ascendant cast for the birth place.


## 12. Report tables, sāyana pages, transits and KP events

Each table is rebuilt from its rule and checked against two reference reports.
Where a report is inconsistent with itself or cannot be reproduced, the
classical rule is used and the difference is listed here.

**Friendship.** The seven follow Parāśara's naisargika table. Tātkālika
friends are in the 2nd, 3rd, 4th, 10th, 11th and 12th from a planet. Pañcadhā
combines the two (friend + friend = adhimitra, and so on). Rāhu and Ketu have
no classical rows; their rows and columns are as the reports print them (the
same in both).

**Dignity.** Exaltation and debilitation by sign. Mūlatrikoṇa as the reports
flag it (the Moon 4–30° Vṛṣabha, Mercury 16–20° Kanyā, the rest Parāśara's
ranges). Combustion orbs: Moon 12°, Mars 17°, Mercury 14° (12° retrograde),
Jupiter 11°, Venus 10° (8° retrograde), Saturn 15°.

**Ṣoḍaśavarga and viṁśopaka.** All sixteen vargas use the same mapping as the
ṣaḍbala module and agree with both reports. Viṁśopaka points per varga: own
sign 20, adhimitra 18, mitra 15, sama 10, śatru 7, adhiśatru 5 (pañcadhā). The
default saptavarga weights are Parāśara's (D1 5, D2 2, D3 3, D7 2.5, D9 4.5,
D12 2, D30 1). The reports use D7 1, D9 2.5, D12 4.5, D30 2; that set can be
selected. The reports' viṁśopaka for Rāhu and Ketu cannot be reproduced and is
not shown.

**Sahams.** Forty-one Tājika sahams in the form A − B + C, where marked adding
one sign when C does not fall between B and A. House cusps are Placidus in the
chart's zodiac. Forty agree with both reports to 2′. The reports print
Jalapatha as 0°; it is computed here from its formula (Karka 15° − Saturn +
Lagna).

**Special lagnas.** From the sidereal Sun at the last sunrise before birth
(upper limb, with refraction): bhāva lagna +15° an hour, horā lagna +30° and
ghaṭī lagna +75°.

**Jaimini.** Rāśi dṛṣṭi: movable signs see the fixed signs except the next
one; fixed signs see the movable signs except the previous one; dual signs see
the other dual signs. Ārūḍha of a house: count from the house to its lord, then
the same distance again. If that lands in the house itself or its 7th, take
the 10th from it.

**Avakahaḍā.** Varṇa and tattva follow the Moon sign by index mod 4. Vaśya is
by whole sign, as the reports print it (matching still uses the classical
halves of Dhanu and Makara). Yuñjā is counted from Revatī: six nakṣatras
pūrva, twelve madhya and nine antya. **Ghātaka** is the classical table for
the Moon sign; the two rows the reports print agree with it.

**Favourable points.** Radical number = digit sum of the birth day; destiny
number = digit sum of the whole date; years marked good = radical + 18 + 9k.
Favourable lords are the lords of the 1st, 9th and 10th; the lords of the 6th,
8th and 12th that are not also favourable are listed separately. The stones are
the gems of the lagna lord and the 9th lord. These are traditional
correspondences, shown as data, not advice.

**Tārā cakra.** Twenty-seven nakṣatras from the janma nakṣatra in three
cycles of nine tārās. Each covers years of life k, k + 27 and k + 54. The
candra and sūrya bindu names are counted inclusively from the Moon's and the
Sun's nakṣatra. They were fitted on one report and confirmed on the other.

**Chalit.** Bhāvas by Śrīpati's sandhis (the same madhyas as bhāva bala).

**Sāyana pages.** Tropical longitudes, motion, latitude and declination;
Placidus cusps. The reports print 0 latitude and declination for the nodes.
Nakṣatra lords on these pages are read on the sāyana longitude, as printed.
Aspects use the whole-degree separation ⌊|a − b|⌋, or 360 − ⌊|a − b|⌋ above
180°. Orbs: conjunction, sextile, square, trine and opposition 8°;
semi-square 4°; sesquiquadrate and quincunx 3°; quintile 2°.

**Daily power chart.** At 05:30 local time on each day: each planet's transit
sign, its house from the natal lagna, and its own natal bhinnāṣṭakavarga
bindus in that sign. The day's total is shown, and the total − 28. The
running mahā/antar/pratyantar daśā is on the daśā module's printed clock.
1,439 of 1,440 printed numbers agree; the other is a pratyantar boundary on
the day it changes.

**Moon's daily tārā.** Segments between the Moon's nakṣatra and sign changes,
with the tārā from the janma nakṣatra, the padas covered, the house from the
lagna and the sarvāṣṭakavarga of the sign. All 90 printed rows agree to the
minute.

**Gochar.** Every sign change of the Sun, Mars, Mercury, Jupiter, Venus,
Saturn and the nodes in a calendar year (Ketu is Rāhu + 180°). Each row shows
the house from the lagna and from the Moon, the planet's own bindus and the
sarvāṣṭakavarga of the sign entered, and the running daśā. The Moon's changes
are in the daily tārā table.

**KP events.** Seventeen matters, as the reports define them (kārakas, cusps,
favourable and unfavourable houses). Each cusp shows its sub lord and the sub
lord's star lord, with the houses each occupies and owns, and the cusp's
significators. Each kāraka shows the same chain. 69 of 74 printed chains agree.
The other five are one report's cusps 3 and 9: they print Rāhu as the star
lord of Mars, while the same report's KP table places Mars in Viśākhā, whose
lord is Jupiter. The KP table, and so Jupiter, is used here.

## 13. Birth particulars, the pañcāṅga's spans, avasthā, kārakas and upagrahas

Code: `packages/vedic/src/particulars.ts`. Checked by hand against a printed
kuṇḍalī (not committed): every span below agreed to the minute, the calendar
fields exactly, avasthā and kārakas for every graha, Fortuna to 11″.

- **The day.** Sunrise and sunset of the civil birth date, upper limb with
  refraction (§7). A birth before sunrise belongs to the previous Hindu day,
  so its ghaṭīs count from the previous sunrise. Ghaṭīs = hours × 2.5. Local
  mean time = UT + longitude/15 h; the correction printed is LMT − zone time.
  Sidereal time is the local one (ARMC/15).
- **Spans.** The Moon's rāśi, tithi (12° of elongation), nakṣatra (13°20′ of
  the Moon), yoga (13°20′ of Sun + Moon) and karaṇa (6° of elongation), each
  with the span before and after, from sidereal longitudes. Edges are found by
  hour steps and bisection to one second.
- **Calendar.** Ayana from the tropical Sun (uttarāyaṇa Capricorn → Cancer);
  gola north while the tropical Sun is in Aries–Virgo. The amānta month is
  named for the saṅkrānti that falls between its new moons (the Sun entering
  Tula falls in Āśvina); with none it is adhika. The pūrṇimānta month is the
  next one in the dark half. Ṛtu by month pairs from Caitra (Vasanta). Śaka =
  year − 78 from Caitra, − 79 before it; Vikrama saṁvat (Caitrādi) = Śaka +
  135, and the Kārttikādi year (Gujarat) is one less from Caitra to Āśvina.
  Saṁvatsara by the luni-solar cycle: (Śaka + 11) mod 60 from Prabhava.
- **Bālādi avasthā.** Fifths of 6°: bāla, kumāra, yuva, vṛddha, mṛta in odd
  signs, the reverse in even ones.
- **Chara kārakas.** The seven grahas (not Rāhu) by degrees travelled in their
  sign, highest first: ātma, amātya, bhrātṛ, mātṛ, putra, jñāti, dāra.
- **Fortuna.** Lagna + Moon − Sun, day and night alike, as Indian prints give it.
- **Gulika and Māndi.** Two readings, both printed and labelled. Gulika: the
  lagna rising when Saturn's eighth of the day (eighths ruled from the
  weekday's lord) or night (from the fifth weekday's lord) begins. Māndi
  (Praśna Mārga): the lagna rising 26, 22, 18, 14, 10, 6, 2 ghaṭīs into the
  day from Sunday, or 10, 6, 2, 26, 22, 18, 14 into the night, the ghaṭīs
  scaled to that day's or night's length. A printed Māndi checked against
  this rule lay 1.1° from it; the cause (their sunrise is 2 minutes later than
  ours) is noted rather than copied.

## 13a. Name letters (nāmākṣara)

Code: `nameLetters`, `englishSpelling` and `englishInitials` in
`packages/vedic/src/tables.ts`; shown with the avakahaḍa table in the Vedic
workspace and on the booklet's pañcāṅga page.

- **The syllable.** Each of the 108 nakṣatra pādas carries one syllable (the
  avakahaḍa table's own list, Aśvinī 1 = Cu). The suggestion is the syllable
  of the pāda the sidereal Moon occupies at birth.
- **Alternatives.** The other three syllables of the same nakṣatra, then the
  Moon sign's. A sign is nine pādas (108 / 12), so its syllables are those of
  pādas 9 × sign to 9 × sign + 8: Meṣa is Aśvinī, Bharaṇī and Kṛttikā 1
  (Cu Ce Co La Li Lu Le Lo A).
- **English spelling.** IAST c is written "ch" and ch "chh", ś and ṣ "sh", ṅ
  "ng", ñ "ny"; other marks are dropped (Ṭa, Ta and Ta all spell "Ta"). The
  starting letters are each syllable's consonants before its vowel, once each.
- Stated as a naming custom, not a prediction. Regional lists differ in a few
  syllables (Uttara Bhādrapadā 4 is also given as "Tra"); this one is the
  table the avakahaḍa page already uses.

## 14. Bhāva readings, Sarvatobhadra and remedies

Code: `packages/vedic/src/bhava.ts`.

- **Bhāva by bhāva.** Whole-sign houses from the lagna. For each: its lord's
  house, sign and dignity; the grahas in it; the grahas aspecting it
  (Parāśara: all the 7th, Mars the 4th and 8th, Jupiter the 5th and 9th,
  Saturn the 3rd and 10th, the nodes the 7th only); its sarvāṣṭakavarga.
  The facts are sorted, never scored into a verdict:
  - supporting: lord in a kendra (or else a trikoṇa); lord in its own,
    mūlatrikoṇa or exaltation sign; natural benefics (Jupiter, Venus,
    Mercury, the Moon) in it; Jupiter's aspect; more than 28 bindus; natural
    malefics in an upacaya (3, 6, 10, 11).
  - asking for care: lord in a dusthāna (6, 8, 12); lord debilitated or
    combust; natural malefics (Sun, Mars, Saturn, Rāhu, Ketu) outside the
    upacayas; fewer than 28 bindus.
  The Moon is counted a benefic whatever its phase, and Mercury whatever its
  company: simpler than the classical qualifications, and stated.
  The text printed with them is the app's own: what the house is read for,
  then these facts. No event is predicted.
- **Bhāva kuṇḍalī labels.** Each small chart is the rāśi chart turned so the
  named house is the lagna. Under it, each graha's functional nature for that
  lagna (`functionalNature`), by the Laghu Pārāśarī lordship rules, checked in
  this order: the lagna lord is benefic; a lord of the 5th or 9th is benefic
  (a trikoṇa outweighs any other house it owns, so the kendra-and-trikoṇa
  yogakāraka is benefic); a lord of the 3rd, 6th, 11th or 8th is malefic, but
  the Sun and the Moon are not blemished by the 8th; lords of kendras, the 2nd
  and the 12th are neutral. Rāhu and Ketu take their dispositor's nature.
  Commercial prints label these with their own unpublished weightings (one
  marks most grahas "average"), so their labels will not always agree.
- **Ṣoḍaśavarga aṣṭakavarga.** For each of the sixteen vargas, the
  aṣṭakavarga rules (§ aṣṭakavarga) applied to the signs the seven grahas and
  the lagna occupy in that varga (`vargaSarva`); every varga's
  sarvāṣṭakavarga totals 337. Checked against a commercial print's D2, D3,
  D9, D30 and D60 charts: every bindu agrees.
- **Sarvatobhadra.** The 9×9 cakra of the printed kuṇḍalīs: 28 nakṣatras
  clockwise from Kṛttikā at the top left, Abhijit between Uttarāṣāḍhā and
  Śravaṇa (276°40′ – 280°53′20″); vowels at the ring corners, consonants on
  the second ring, signs on the third, the tithi groups at the centre. Natal
  grahas are drawn in their nakṣatra's cell, with the transit positions on the
  generation date. Vedha is computed since 0.42: see § 14a.
- **Remedies.** The bīja mantras, customary japa counts, weekdays, deities and
  charity of the nine grahas, as tradition records them; marked for the
  running daśā lords and for debilitated or combust grahas. Printed as
  tradition, with the caution that they replace no professional advice.

## 14a. Sarvatobhadra vedha (computed)

Code: `packages/vedic/src/sbcVedha.ts`. Used by Financial astrology → Daily
vedha.

- **Geometry, verified cell by cell.** A graha in an edge nakṣatra casts
  three straight lines across the cakra:
  - **front:** straight across, to the nakṣatra on the facing edge;
  - **behind:** the diagonal towards the earlier nakṣatra;
  - **ahead:** the diagonal towards the later nakṣatra.

  The diagonals strike every cell they cross (vowel, consonant, sign, tithi
  group). The **front line strikes only the nakṣatra at its far end.**
  - This is how the Horaratna's worked lists read in V. Subrahmanya Sastri's
    rendering (*Phaladeepika*, 2nd ed. 1950, p. 312). Kṛttikā: Bharaṇī, the
    vowel, Vṛṣabha, Nandā, Bhadrā, Tulā, the consonant, Viśākhā, Śravaṇa.
    Rohiṇī and Mṛgaśirā are given likewise. All three lists match the cakra
    cell for cell in the tests.
  - 0.42 let the front line strike every cell, which made Saturn "hit" the
    tithi group every day in late 2026.

  The pairing works both ways, and Abhijit has its own cell at row 8,
  column 2.
- **Two methods, reported side by side:**
  - **Method B** counts all three lines for every graha.
  - **Method A** counts only the line(s) a tradition's motion rule selects
    (for example, direct → front). Rāhu and Ketu, and in some texts the Sun,
    have fixed rules.
- **The tradition is a versioned object** (`SbcTradition`). It carries:
  - its id, version, reference and status;
  - its vāma/dakṣiṇa naming and the basis for it;
  - its front-line rule, its Moon and Mercury rules, and its Method A table.

  `validateTradition` refuses one with no version or no reference. It also
  refuses a *sourced* or *verified* one with no page or verse number, and a
  *sourced* one that names sides without explaining them.
- **The production tradition** is `SBC_HORARATNA_V1` (1.0.0, status
  *sourced*), from the Horaratna in Sastri's English rendering
  (*Phaladeepika*, 2nd ed. 1950, pp. 311–315; Phaladeepika XXVI.48):
  - for Mars, Mercury, Jupiter, Venus and Saturn: retrograde → right
    (dakṣiṇa), swift → left (vāma), mean → front (sammukha), p. 312;
  - Rāhu and Ketu, "always retrograde": right; the Sun and the Moon, which
    never retrograde: left (p. 313);
  - malefics are Saturn, the Sun, Rāhu, Ketu and Mars; Mercury with
    malefics; the waning Moon (p. 312). "With malefics" is read as sharing a
    rāśi with one.
- **Not stated by the text, so settled by a convention shown with every
  result (`sidesBasis`):**
  - Which diagonal is left. A graha stands on the edge facing into the cakra
    with East at the top, so from Kṛttikā its left hand points to Viśākhā
    (`vamaLine: 'ahead'`). This fits the rule: swift motion carries a graha
    forward and gives the left vedha; retrograde carries it back and gives
    the right.
  - What "swift" means: faster than the mean daily motion.
  - Stations: not covered, so "not evaluated".
- **The other reading** is `SBC_ALL_THREE_V1`: the luminaries and the nodes
  cast all three vedhas, and the Moon is malefic from the 11th tithi of the
  dark half to the 4th of the bright. Source: N. Venkatachalaiah and K. R. Sai
  Shankar's compilation, whose own note records the difference of opinion.
- **The superseded geometry** `SBC_GEOMETRY_V1` (1.0.0: front line on every
  cell, no Method A) is kept so that studies saved with it reopen
  unchanged.
- **The test fixture** is `SBC_METHOD_A_FIXTURE` (status *test fixture*). It
  takes its motion rule from the secondary Wikipedia summary:
  - direct → sammukha, fast → vāma, retrograde → dakṣiṇa;
  - the Sun and the nodes cast all three lines;
  - the Moon is not covered.

  It exists to exercise the code path and is labelled everywhere it appears.
- **Motion** comes from the graha's speed against `MEAN_DAILY_MOTION`:
  - retrograde when negative;
  - stationary below `stationFraction` of its mean;
  - fast above its mean;
  - otherwise direct.

  Neither the fixture nor the Horaratna covers stationary.
- **Ketu** is Rāhu + 180°, normalised, under both the mean and the true node.
- **Benefic and malefic:** set by the tradition, as listed above. Under the
  superseded geometry, the Moon goes by pakṣa and Mercury is left
  *variable*.
- **Targets carry provenance.** Each target is one of:
  - the natal Moon nakṣatra or rāśi, or the ascendant sign, taken from a
    chart record and labelled with its certainty;
  - a name consonant or vowel, user-entered and labelled *name-based*;
  - the tithi group.

  A target never borrows another's provenance.
- **Three outcomes, never merged:**
  - **hit:** a line selected by the method reaches the target;
  - **no hit:** the method was applied and no line reaches it;
  - **not evaluated:** the method could not be applied. The reason code says
    why: METHOD_A_UNAVAILABLE, GRAHA_NOT_COVERED, MOTION_NOT_COVERED,
    SIDES_UNNAMED, TARGET_NOT_GIVEN or TARGET_NOT_ON_CAKRA.

  When A and B differ, `disagreement` names the reason
  (A_NOT_EVALUATED or MOTION_SELECTS_OTHER_LINE).
- **What it is not:** a forecast. The daily table counts hits beside the
  market's direction on valid sessions. It is a description, not a test, and
  it says so on screen.

## 15. Readings (phala)

Code: `packages/vedic/src/phala.ts` (facts) and
`apps/web/src/components/vedic/Phala.tsx` (sentences).

The readings are composed by rule, never copied: each sentence is one fact of
this chart joined to the classical association it carries, and each names the
tradition as the reader. No sentence states an event as certain.

- **Lagna and Moon.** The sign's element (fire, earth, air, water from Meṣa)
  and modality (cara, sthira, dvisvabhāva) with the traits tradition gives
  them; the lagna lord's house; the Moon's nakṣatra and its lord.
- **Each graha.** Its themes (kārakatva); the class of its house (kendra 1, 4,
  7, 10; trikoṇa 5, 9; upacaya 3, 6, 11; dusthāna 8, 12; the 2nd) read
  against its natural nature (benefics: Jupiter, Venus, Mercury, the Moon) —
  benefics favour kendras and trikoṇas, malefics grow strong in upacayas; the
  houses it rules carried into the house it occupies (the nodes act for their
  dispositor); its dignity, combustion and retrogression; its functional nature
  for the lagna (§14).
- **Daśās.** The running mahādaśā lord's themes, house and lordships (a node's
  dispositor's house). Each antardaśā: its house, its functional nature, and
  its place counted from the mahādaśā lord — kendra or trikoṇa from it
  supportive, the 6th, 8th or 12th asking for care, the rest mixed. Every
  mahādaśā of the life in a line.
- **The year.** Each mudda daśā lord's house in the varṣa chart, with its
  natal functional nature.

## 16. Gemstones and KP favourable points

Code: `packages/vedic/src/ratna.ts`, `kpAspectPoints` in `kp.ts`.

- **Ratna.** The stone, metal, finger and weekday of each graha are the
  common printed correspondences; the wearing nakṣatras are the three the
  graha rules in the Viṁśottarī order. What the chart points to is derived,
  not looked up: a stone is said to strengthen its graha, so tradition
  suggests only those of the lagna lord, the 5th lord and the 9th lord, and
  advises against those of functional malefics (§14) that rule no trikoṇa.
  Two stones are kept apart when their grahas are natural enemies in either
  direction; Rāhu and Ketu, the eclipsers, count as enemies of the Sun and
  Moon. Weights in ratti differ between books and follow no rule, so none are
  printed. The page repeats the tradition's own caution against wearing a
  stone on a horoscope alone.
- **Favourable aspect points (KP).** For the lagna and each graha, the
  longitudes at 18°, 30°, 36°, 54°, 60°, 72°, 108°, 120°, 126° and 144° ahead
  (separating) and behind (applying): the 18° series with the semi-sextile,
  sextile and trine, never the square or opposition. The same arithmetic as
  the commercial print's table (checked on its lagna row).
- **At a glance.** A summary page of facts computed elsewhere: rāśi and
  navāṁśa charts, the sarvāṣṭakavarga, functional benefics and malefics, the
  yogakāraka (a graha ruling both a kendra and a trikoṇa), Maṅgala doṣa (§
  matching), today's sāḍe-sātī, and the Viṁśottarī periods.

## 8. What this module does not do

Stated so nobody mistakes absence for an oversight:

- Vargas beyond the sixteen of the ṣoḍaśavarga
- Muhūrta and praśna
- Cara and Kālacakra daśā

Each would need its own conventions documented first, exactly as these are.
