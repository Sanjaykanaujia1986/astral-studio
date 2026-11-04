/**
 * English interpretation catalogue.
 *
 * Content, not code. Nothing here decides anything; the composer picks entries
 * and the templates join them up.
 *
 * ## Why keywords, composed
 *
 * A full delineation text is roughly 1,500 paragraphs — ten bodies across
 * twelve signs and twelve houses, plus every aspect pair. No one can review
 * that, and an unreviewable catalogue is exactly where invented filler hides.
 * These forty-odd factors generate the same coverage from text a person can
 * actually read end to end in ten minutes, which is the point.
 *
 * The composition follows the structure the tradition itself uses: a planet is
 * a FUNCTION, a sign is the MANNER in which that function is exercised, a house
 * is the FIELD it operates in, and an aspect is a RELATION between two
 * functions. The phrases below are written to slot into that grammar, which is
 * why they read as fragments rather than as finished sentences.
 *
 * This is deliberately keyword-level and says so in `provenance`. A fuller
 * professional text can be dropped in through the same interface without the
 * selection logic changing at all.
 */
import type { Catalogue } from '../types.js';

export const EN_CATALOGUE: Catalogue = {
  locale: 'en',
  revision: '2026-08-26.1',
  provenance:
    'Keyword-level delineation composed from traditional Western significations: '
    + 'planet as function, sign as manner, house as field, aspect as relation. '
    + 'Written for this project; not reproduced from any third-party text.',
  reviewed: true,

  templates: {
    planetInSign: '{bodyPhrase}, expressed {signPhrase}.',
    planetInHouse: '{bodyPhrase}, at work {housePhrase}.',
    planetInSignAndHouse:
      '{bodyPhrase}, expressed {signPhrase}, at work {housePhrase}.',
    // Named bodies with their keywords, NOT their full phrases. The phrases
    // are comma-laden noun clauses; two of them joined by "and" produce a
    // sentence no reader can parse. See the note in compose.ts.
    aspect: '{a} ({aKeywords}) and {b} ({bKeywords}) {aspectPhrase}.',
    shape: '{shapePhrase}',
    elementEmphasis:
      '{count} of {total} bodies in {element} signs. The chart leans on {elementPhrase}.',
    elementLack:
      'No bodies in {element} signs. What is thin here: {keywords}.',
    modalityEmphasis:
      '{count} of {total} bodies are {modality}. The habit is {modalityPhrase}.',
    hemisphereEmphasis: '{count} of {total} bodies. {hemispherePhrase}',
    ascendant: 'The manner of meeting the world: {signPhrase}.',
    midheaven: 'Vocation and public direction are approached {signPhrase}.',
    retrograde:
      '{bodyPhrase} turns inward here — reviewed privately before it is expressed.',
  },

  bodies: {
    sun: {
      title: 'Sun',
      keywords: ['identity', 'purpose', 'vitality', 'will'],
      phrase: 'The drive to become someone in particular',
    },
    moon: {
      title: 'Moon',
      keywords: ['instinct', 'safety', 'memory', 'response'],
      phrase: 'The need for safety, and the rhythm of instinctive response',
    },
    mercury: {
      title: 'Mercury',
      keywords: ['perception', 'language', 'reasoning', 'exchange'],
      phrase: 'The way things are noticed, sorted and said',
    },
    venus: {
      title: 'Venus',
      keywords: ['value', 'attraction', 'harmony', 'pleasure'],
      phrase: 'What is valued, and how closeness is offered',
    },
    mars: {
      title: 'Mars',
      keywords: ['effort', 'assertion', 'desire', 'conflict'],
      phrase: 'The way effort is applied and conflict is met',
    },
    jupiter: {
      title: 'Jupiter',
      keywords: ['meaning', 'growth', 'confidence', 'excess'],
      phrase: 'The appetite for meaning, and for more room',
    },
    saturn: {
      title: 'Saturn',
      keywords: ['limit', 'structure', 'time', 'responsibility'],
      phrase: 'Where limits are met, and what has to be earned',
    },
    uranus: {
      title: 'Uranus',
      keywords: ['disruption', 'independence', 'invention', 'sudden change'],
      phrase: 'The impulse to break the established pattern',
    },
    neptune: {
      title: 'Neptune',
      keywords: ['imagination', 'compassion', 'dissolution', 'illusion'],
      phrase: 'Where the edges dissolve — imagination, and also illusion',
    },
    pluto: {
      title: 'Pluto',
      keywords: ['power', 'compulsion', 'depth', 'regeneration'],
      phrase: 'What is compelled, buried, and eventually remade',
    },
    chiron: {
      title: 'Chiron',
      keywords: ['wound', 'healing', 'teaching', 'incurable ache'],
      phrase: 'The old injury that slowly turns into competence',
    },
  },

  signs: {
    aries: {
      title: 'Aries',
      keywords: ['direct', 'immediate', 'competitive', 'impatient'],
      phrase: 'directly, at speed, and on its own initiative',
    },
    taurus: {
      title: 'Taurus',
      keywords: ['steady', 'sensory', 'tenacious', 'resistant to change'],
      phrase: 'steadily, through the senses, and with a strong wish for security',
    },
    gemini: {
      title: 'Gemini',
      keywords: ['curious', 'verbal', 'versatile', 'restless'],
      phrase: 'curiously, in words, and across several interests at once',
    },
    cancer: {
      title: 'Cancer',
      keywords: ['protective', 'tidal', 'retentive', 'indirect'],
      phrase: 'protectively, through feeling, and with an eye to what is familiar',
    },
    leo: {
      title: 'Leo',
      keywords: ['warm', 'expressive', 'proud', 'generous'],
      phrase: 'warmly, with display, and a wish to be recognised',
    },
    virgo: {
      title: 'Virgo',
      keywords: ['analytical', 'exacting', 'useful', 'self-critical'],
      phrase: 'carefully, by analysis, and with attention to what could be improved',
    },
    libra: {
      title: 'Libra',
      keywords: ['relational', 'even-handed', 'considered', 'indecisive'],
      phrase: 'through relationship, weighing both sides before committing to one',
    },
    scorpio: {
      title: 'Scorpio',
      keywords: ['intense', 'private', 'penetrating', 'all-or-nothing'],
      phrase: 'intensely, in private, and with a refusal to settle for the surface',
    },
    sagittarius: {
      title: 'Sagittarius',
      keywords: ['expansive', 'principled', 'far-sighted', 'blunt'],
      phrase: 'expansively, on principle, and with an eye on the wider view',
    },
    capricorn: {
      title: 'Capricorn',
      keywords: ['sober', 'ambitious', 'patient', 'self-denying'],
      phrase: 'soberly, by degrees, and with regard for what will last',
    },
    aquarius: {
      title: 'Aquarius',
      keywords: ['independent', 'systemic', 'detached', 'contrary'],
      phrase: 'independently, on its own terms, and with an eye to the collective',
    },
    pisces: {
      title: 'Pisces',
      keywords: ['receptive', 'imaginative', 'porous', 'elusive'],
      phrase: 'receptively, without hard edges, dissolving the boundary between things',
    },
  },

  houses: {
    1: {
      title: 'First house',
      keywords: ['appearance', 'bearing', 'approach'],
      phrase: 'in the body, the bearing, and the first impression given',
    },
    2: {
      title: 'Second house',
      keywords: ['resources', 'income', 'worth'],
      phrase: 'in resources, earnings, and what is held to be worth having',
    },
    3: {
      title: 'Third house',
      keywords: ['speech', 'learning', 'siblings', 'locality'],
      phrase: 'in speech, early learning, and the immediate neighbourhood',
    },
    4: {
      title: 'Fourth house',
      keywords: ['home', 'family', 'roots', 'privacy'],
      phrase: 'in home, family, and where one comes from',
    },
    5: {
      title: 'Fifth house',
      keywords: ['play', 'romance', 'children', 'creation'],
      phrase: 'in play, romance, children, and creative display',
    },
    6: {
      title: 'Sixth house',
      keywords: ['work', 'routine', 'health', 'service'],
      phrase: 'in daily work, routine, health, and service',
    },
    7: {
      title: 'Seventh house',
      keywords: ['partnership', 'the other', 'agreements', 'open enemies'],
      phrase: 'in partnership, and in whoever is met as an equal',
    },
    8: {
      title: 'Eighth house',
      keywords: ['shared resources', 'debt', 'crisis', 'transformation'],
      phrase: 'in what is shared, owed, inherited, and transformed',
    },
    9: {
      title: 'Ninth house',
      keywords: ['belief', 'travel', 'higher study', 'meaning'],
      phrase: 'in travel, belief, higher study, and the long view',
    },
    10: {
      title: 'Tenth house',
      keywords: ['vocation', 'standing', 'authority', 'the visible life'],
      phrase: 'in vocation, standing, and public direction',
    },
    11: {
      title: 'Eleventh house',
      keywords: ['friendship', 'groups', 'hopes', 'allies'],
      phrase: 'in friendship, groups, and hopes for the future',
    },
    12: {
      title: 'Twelfth house',
      keywords: ['retreat', 'the unseen', 'undoing', 'the inner life'],
      phrase: 'in solitude, retreat, and what goes on out of sight',
    },
  },

  aspects: {
    conjunction: {
      title: 'Conjunction',
      keywords: ['fusion', 'emphasis', 'inseparable'],
      phrase: 'act as one, for better and worse — neither can be used without the other',
    },
    opposition: {
      title: 'Opposition',
      keywords: ['polarity', 'projection', 'awareness through others'],
      phrase: 'face one another across the chart, and get worked out through other people',
    },
    square: {
      title: 'Square',
      keywords: ['friction', 'drive', 'forced adjustment'],
      phrase: 'grind against one another, forcing an adjustment neither would choose',
    },
    trine: {
      title: 'Trine',
      keywords: ['ease', 'talent', 'unearned flow'],
      phrase: 'flow together easily — so easily that the ability can go unused',
    },
    sextile: {
      title: 'Sextile',
      keywords: ['opportunity', 'cooperation', 'requires effort'],
      phrase: 'cooperate readily, but only when the opportunity is actually taken up',
    },
    quincunx: {
      title: 'Quincunx',
      keywords: ['mismatch', 'adjustment', 'no common ground'],
      phrase: 'have little in common, and must be adjusted repeatedly rather than resolved',
    },
    semisextile: {
      title: 'Semisextile',
      keywords: ['adjacency', 'mild awareness'],
      phrase: 'sit side by side, mildly and intermittently aware of one another',
    },
    semisquare: {
      title: 'Semisquare',
      keywords: ['irritation', 'minor friction'],
      phrase: 'chafe against each other — a small friction that accumulates over time',
    },
    sesquiquadrate: {
      title: 'Sesquiquadrate',
      keywords: ['awkward strain', 'recurring irritation'],
      phrase: 'pull at an awkward angle, showing up as a recurring, low-grade strain',
    },
    quintile: {
      title: 'Quintile',
      keywords: ['knack', 'style', 'particular skill'],
      phrase: 'combine into a distinctive knack that is easier shown than explained',
    },
    biquintile: {
      title: 'Biquintile',
      keywords: ['talent', 'absorption'],
      phrase: 'meet in a talent that surfaces when the person is thoroughly absorbed',
    },
  },

  shapes: {
    bundle: {
      title: 'Bundle',
      keywords: ['concentration', 'narrow focus', 'specialist'],
      phrase:
        'Every body falls inside a third of the circle. Considerable focus, and a narrow '
        + 'field of view: whole regions of the chart stand empty.',
    },
    bowl: {
      title: 'Bowl',
      keywords: ['self-contained', 'aware of what is missing'],
      phrase:
        'All ten bodies occupy one half of the circle. Such a chart tends to be conscious '
        + 'of what it lacks, and the leading planet marks the edge it presses forward from.',
    },
    bucket: {
      title: 'Bucket',
      keywords: ['handle', 'outlet', 'single channel'],
      phrase:
        'A bowl with one body standing alone across the circle. That single planet is the '
        + 'handle: the narrow outlet through which everything else is discharged.',
    },
    locomotive: {
      title: 'Locomotive',
      keywords: ['drive', 'momentum', 'self-propelled'],
      phrase:
        'Two thirds of the circle is occupied and one third is empty. A driving, '
        + 'self-propelled pattern, led by the planet at the leading edge of the group.',
    },
    seesaw: {
      title: 'Seesaw',
      keywords: ['two camps', 'weighing', 'oscillation'],
      phrase:
        'The bodies fall into two opposed groups. Life is met by weighing one side against '
        + 'the other, and the swing between them is the characteristic motion.',
    },
    splash: {
      title: 'Splash',
      keywords: ['breadth', 'scattering', 'many interests'],
      phrase:
        'The bodies are scattered widely with no large gap anywhere. Broad interests, '
        + 'at some cost to concentration.',
    },
    splay: {
      title: 'Splay',
      keywords: ['irregular', 'individual', 'clustered'],
      phrase:
        'An irregular arrangement of clusters that fits none of the standard patterns — '
        + 'individual, and resistant to summary.',
    },
  },

  elements: {
    fire: {
      title: 'Fire',
      keywords: ['warmth', 'initiative', 'enthusiasm', 'impatience'],
      phrase: 'warmth, initiative, and a readiness to act before all the details are in',
    },
    earth: {
      title: 'Earth',
      keywords: ['practicality', 'patience', 'realism', 'inertia'],
      phrase: 'practicality, patience, and a preference for what can actually be handled',
    },
    air: {
      title: 'Air',
      keywords: ['ideas', 'language', 'perspective', 'detachment'],
      phrase: 'ideas, language, and enough distance to see the pattern',
    },
    water: {
      title: 'Water',
      keywords: ['feeling', 'memory', 'empathy', 'absorption'],
      phrase: 'feeling, memory, and a fine sensitivity to atmosphere',
    },
  },

  modalities: {
    cardinal: {
      title: 'Cardinal',
      keywords: ['initiating', 'launching', 'restless'],
      phrase: 'to start things — initiative, with less appetite for finishing them',
    },
    fixed: {
      title: 'Fixed',
      keywords: ['persistent', 'consolidating', 'immovable'],
      phrase: 'to hold on — persistence, and real difficulty letting go',
    },
    mutable: {
      title: 'Mutable',
      keywords: ['adaptable', 'responsive', 'diffuse'],
      phrase: 'to adapt — flexibility, and a tendency to scatter',
    },
  },

  hemispheres: {
    aboveHorizon: {
      title: 'Above the horizon',
      keywords: ['public', 'outward', 'visible'],
      phrase: 'The weight of the chart sits above the horizon: a life lived in view, turned outward.',
    },
    belowHorizon: {
      title: 'Below the horizon',
      keywords: ['private', 'inward', 'foundational'],
      phrase: 'The weight of the chart sits below the horizon: a life built privately, from the inside out.',
    },
    eastern: {
      title: 'Eastern half',
      keywords: ['self-directed', 'initiating'],
      phrase: 'Weight on the ascendant side: circumstances are shaped largely by the person’s own initiative.',
    },
    western: {
      title: 'Western half',
      keywords: ['other-directed', 'responsive'],
      phrase: 'Weight on the descendant side: circumstances tend to arrive through other people.',
    },
  },
};
