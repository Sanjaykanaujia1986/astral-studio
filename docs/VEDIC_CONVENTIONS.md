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

## 8. What this module does not do

Stated so nobody mistakes absence for an oversight:

- Bhāva-chalita houses
- Vargas beyond those listed
- Śaḍbala, aṣṭakavarga, or any strength calculation
- Yogas (rāja, dhana, etc.) — pattern detection needs documented rules per yoga
- Kuṭa / guṇa-milāna matching
- Muhūrta, praśna, varṣaphala
- Daśā systems other than Viṁśottarī (Aṣṭottarī, Yoginī, Cara, Kālacakra)
- Lunar month, ṛtu, saṁvatsara naming, and the amānta/pūrṇimānta distinction

Each would need its own conventions documented first, exactly as these are.
