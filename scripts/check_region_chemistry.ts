import { strict as assert } from 'node:assert'
import { BASE_PLAYER_CARDS, LEGEND_CARDS, COACH_CARDS, chemistry, type PlayerCard, type CoachCard } from '../src/engine/cards'
import { sameGameRegion } from '../src/engine/gameRegions'
import { sameClubLineage } from '../src/engine/teamLineage'
import { natCountry } from '../src/engine/nat'

const originalBaseCards = JSON.stringify(BASE_PLAYER_CARDS)
const originalCoaches = JSON.stringify(COACH_CARDS)
const originalLegends = JSON.stringify(LEGEND_CARDS)

const WESTERN_REGIONS = ['LEC', 'LCS', 'LCP', 'CBLOL'] as const

type PlayerCardWithId = PlayerCard & { id: string }

function findPlayersByRegion(region: string): PlayerCardWithId[] {
  return BASE_PLAYER_CARDS.filter(
    (card): card is PlayerCardWithId =>
      typeof card.id === 'string' && card.region === region
  )
}

function findCoachByRegion(region: string): CoachCard | undefined {
  return COACH_CARDS.find((coach) => coach.region === region)
}

// Test 1: sameGameRegion illegal inputs
const illegalInputs: unknown[] = [undefined, null, '', 'UNKNOWN', 'lec', 'WEST ', true, NaN, 123, {}, []]
for (let i = 0; i < illegalInputs.length; i++) {
  for (let j = 0; j < illegalInputs.length; j++) {
    assert.equal(
      sameGameRegion(illegalInputs[i], illegalInputs[j]),
      false,
      `sameGameRegion should be false for illegal inputs: ${JSON.stringify(illegalInputs[i])} vs ${JSON.stringify(illegalInputs[j])}`
    )
  }
}

// Test 2: illegal pair with 'LEC' both ways
for (const illegal of [undefined, null, '', 'UNKNOWN', 'lec', 'WEST ', true, NaN, 123, {}, []]) {
  assert.equal(sameGameRegion(illegal, 'LEC'), false, `sameGameRegion(illegal, 'LEC') should be false`)
  assert.equal(sameGameRegion('LEC', illegal), false, `sameGameRegion('LEC', illegal) should be false`)
}

// Test 3: All pairs across LEC/LCS/LCP/CBLOL should be same region
for (const regionA of WESTERN_REGIONS) {
  for (const regionB of WESTERN_REGIONS) {
    assert.equal(
      sameGameRegion(regionA, regionB),
      true,
      `${regionA} and ${regionB} should be same game region (WEST)`
    )
  }
}

// Test 4: LPL/LCK should not be same region with WESTERN_REGIONS
const easternRegions = ['LPL', 'LCK'] as const
for (const east of easternRegions) {
  for (const west of WESTERN_REGIONS) {
    assert.equal(sameGameRegion(east, west), false, `${east} and ${west} should not be same game region`)
    assert.equal(sameGameRegion(west, east), false, `${west} and ${east} should not be same game region`)
  }
}

// Test 5: Real data - find cross-region pairs with different nationality and club
let pairCount = 0
let coachPairCount = 0

for (let i = 0; i < WESTERN_REGIONS.length; i++) {
  for (let j = i + 1; j < WESTERN_REGIONS.length; j++) {
    const regionA = WESTERN_REGIONS[i]
    const regionB = WESTERN_REGIONS[j]
    const playersA = findPlayersByRegion(regionA)
    const playersB = findPlayersByRegion(regionB)

    let foundPair = false
    for (const playerA of playersA) {
      for (const playerB of playersB) {
        if (!playerA.nat || !playerB.nat) continue
        // Different nationality
        if (playerA.nat && playerB.nat && natCountry(playerA.nat) === natCountry(playerB.nat)) {
          continue
        }
        // Different club
        if (sameClubLineage(playerA, playerB)) {
          continue
        }

        // Test chemistry between these two
        const report = chemistry({ slots: [playerA.id, playerB.id, null, null, null], coach: null })
        const regionLink = report.links.find((link) => link.why === 'region')
        assert.ok(regionLink, `Expected region link between ${playerA.id} (${regionA}) and ${playerB.id} (${regionB})`)
        assert.equal(regionLink.value, 1, `Region link value should be 1 for ${playerA.id}-${playerB.id}`)
        pairCount++
        foundPair = true
        break
      }
      if (foundPair) break
    }
  }
}

assert.equal(pairCount, 6, 'All six original western-region pairs must be tested')

// Test 6: Coach chemistry across western regions
for (const coachRegion of WESTERN_REGIONS) {
  const coach = findCoachByRegion(coachRegion)
  if (!coach) continue

  for (const playerRegion of WESTERN_REGIONS) {
    if (playerRegion === coachRegion) continue
    const players = findPlayersByRegion(playerRegion)

    for (const player of players) {
      // Ensure different club
      if (sameClubLineage(player, coach)) {
        continue
      }

      const report = chemistry({ slots: [player.id, null, null, null, null], coach: coach.id })
      assert.equal(report.coachBonus, 1, `Coach bonus should be 1 for ${coach.id} (${coachRegion}) with ${player.id} (${playerRegion})`)
      const coachLink = report.coachLinks.find((link) => link.slot === 0)
      assert.ok(coachLink, `Expected coach link for slot 0`)
      assert.equal(coachLink.why, 'region', `Coach link should be region for ${coach.id}-${player.id}`)
      assert.equal(coachLink.value, 1, `Coach link value should be 1 for ${coach.id}-${player.id}`)
      coachPairCount++
      break
    }
  }
}

assert.equal(coachPairCount, 12, 'All twelve directed cross-region coach pairs must be tested')

// Test 7: Priority - club > nat > region
let clubPriorityTested = false
let natPriorityTested = false

for (let i = 0; i < WESTERN_REGIONS.length; i++) {
  for (let j = i; j < WESTERN_REGIONS.length; j++) {
    const regionA = WESTERN_REGIONS[i]
    const regionB = WESTERN_REGIONS[j]
    const playersA = findPlayersByRegion(regionA)
    const playersB = findPlayersByRegion(regionB)

    // Test club priority
    for (const playerA of playersA) {
      for (const playerB of playersB) {
        if (playerA.id === playerB.id || !sameClubLineage(playerA, playerB)) continue
        const report = chemistry({ slots: [playerA.id, playerB.id, null, null, null], coach: null })
        const clubLink = report.links.find((link) => link.why === 'club')
        assert.ok(clubLink, `Expected club link between ${playerA.id} and ${playerB.id}`)
        assert.equal(clubLink.value, 3, `Club link value should be 3`)
        assert.equal(report.links.length, 1, 'Should only have club link, not nat/region')
        clubPriorityTested = true
        break
      }
      if (clubPriorityTested) break
    }

    // Test nat priority
    for (const playerA of playersA) {
      for (const playerB of playersB) {
        if (sameClubLineage(playerA, playerB)) continue
        if (!(playerA.nat && playerB.nat && natCountry(playerA.nat) === natCountry(playerB.nat))) continue
        const report = chemistry({ slots: [playerA.id, playerB.id, null, null, null], coach: null })
        const natLink = report.links.find((link) => link.why === 'nat')
        assert.ok(natLink, `Expected nat link between ${playerA.id} and ${playerB.id}`)
        assert.equal(natLink.value, 2, `Nat link value should be 2`)
        assert.equal(report.links.length, 1, 'Should only have nat link, not region')
        natPriorityTested = true
        break
      }
      if (natPriorityTested) break
    }
  }
}

// Test 8: Eastern regions should not have region link
let easternPairTested = false
const lplPlayers = findPlayersByRegion('LPL')
const lckPlayers = findPlayersByRegion('LCK')

for (const lplPlayer of lplPlayers) {
  for (const lckPlayer of lckPlayers) {
    // Different nationality and club
    if (lplPlayer.nat && lckPlayer.nat && natCountry(lplPlayer.nat) === natCountry(lckPlayer.nat)) {
      continue
    }
    if (sameClubLineage(lplPlayer, lckPlayer)) {
      continue
    }

    const report = chemistry({ slots: [lplPlayer.id, lckPlayer.id, null, null, null], coach: null })
    const regionLink = report.links.find((link) => link.why === 'region')
    assert.equal(regionLink, undefined, `Should not have region link between LPL and LCK: ${lplPlayer.id}-${lckPlayer.id}`)
    easternPairTested = true
    break
  }
  if (easternPairTested) break
}

// Test 9: Coach should not cross-region bonus for eastern-western
let easternCoachTested = false
const lplCoach = findCoachByRegion('LPL')

if (lplCoach) {
  const westernPlayers = findPlayersByRegion('LEC')
  if (westernPlayers.length > 0) {
    const player = westernPlayers[0]
    if (!sameClubLineage(player, lplCoach)) {
      const report = chemistry({ slots: [player.id, null, null, null, null], coach: lplCoach.id })
      assert.equal(report.coachBonus, 0, `Should not have coach bonus for LPL coach with LEC player`)
      easternCoachTested = true
    }
  }
}

assert.ok(clubPriorityTested && natPriorityTested, 'Both priority branches must run')
assert.ok(easternPairTested && easternCoachTested, 'Negative cross-region branches must run')

// Test 10: Metadata immutability - all cards and coaches unchanged

// Run chemistry on multiple pairs to ensure no mutation
for (let i = 0; i < Math.min(BASE_PLAYER_CARDS.length, 20); i++) {
  for (let j = i + 1; j < Math.min(BASE_PLAYER_CARDS.length, 20); j++) {
    const cardA = BASE_PLAYER_CARDS[i]
    const cardB = BASE_PLAYER_CARDS[j]
    if (cardA.id && cardB.id) {
      chemistry({ slots: [cardA.id, cardB.id, null, null, null], coach: null })
    }
  }
}

for (const coach of COACH_CARDS) {
  const player = BASE_PLAYER_CARDS[0]
  if (player.id && coach.id) {
    chemistry({ slots: [player.id, null, null, null, null], coach: coach.id })
  }
}

assert.equal(
  JSON.stringify(BASE_PLAYER_CARDS),
  originalBaseCards,
  'BASE_PLAYER_CARDS should not be mutated by chemistry function'
)
assert.equal(
  JSON.stringify(COACH_CARDS),
  originalCoaches,
  'COACH_CARDS should not be mutated by chemistry function'
)

assert.equal(JSON.stringify(LEGEND_CARDS), originalLegends, 'legend metadata unchanged')

// Known regions stay distinct and unknown values can never create a bond.
assert.equal(sameGameRegion('LPL', 'LCK'), false)
assert.equal(sameGameRegion('LPL', 'LPL'), true)
assert.equal(sameGameRegion('LCK', 'LCK'), true)
assert.equal(sameGameRegion('WEST', 'LCP'), true)
for (const east of ['LPL', 'LCK']) {
  for (const west of WESTERN_REGIONS) {
    const pair = findPlayersByRegion(east).flatMap(a => findPlayersByRegion(west).map(b => [a,b] as const))
      .find(([a,b]) => a.nat && b.nat && natCountry(a.nat) !== natCountry(b.nat) && !sameClubLineage(a,b))
    assert.ok(pair, `Missing real ${east}/${west} cross-nation fixture`)
    assert.equal(chemistry({slots:[pair[0].id,pair[1].id,null,null,null],coach:null}).links.length, 0)
    const coach = findCoachByRegion(east)!
    const player = findPlayersByRegion(west).find(p => !sameClubLineage(p,coach))!
    const report = chemistry({slots:[player.id,null,null,null,null],coach:coach.id})
    assert.equal(report.coachBonus, 0)
    assert.deepEqual(report.coachLinks, [])
  }
}

const doublelift = LEGEND_CARDS.find(c => c.ign === 'Doublelift')!
const caps = LEGEND_CARDS.find(c => c.ign === 'Caps')!
assert.ok(doublelift && caps && doublelift.region !== caps.region)
assert.ok(doublelift.nat && caps.nat && natCountry(doublelift.nat) !== natCountry(caps.nat))
assert.ok(!sameClubLineage(doublelift, caps))
const legendPair = chemistry({slots:[doublelift.id,caps.id,null,null,null],coach:null})
assert.equal(legendPair.links.length, 1)
assert.equal(legendPair.links[0].why, 'region')
assert.equal(legendPair.links[0].value, 1)
assert.equal(JSON.stringify(BASE_PLAYER_CARDS), originalBaseCards)
assert.equal(JSON.stringify(COACH_CARDS), originalCoaches)
assert.equal(JSON.stringify(LEGEND_CARDS), originalLegends)

console.log(`✓ Region chemistry tests passed`)
console.log(`  Player pairs tested: ${pairCount}`)
console.log(`  Coach-player pairs tested: ${coachPairCount}`)
console.log(`  Club priority tested: ${clubPriorityTested}`)
console.log(`  Nat priority tested: ${natPriorityTested}`)
console.log(`  Eastern pair tested: ${easternPairTested}`)
console.log(`  Eastern coach tested: ${easternCoachTested}`)
console.log('Eight LPL/LCK versus western player and coach exclusions passed')
console.log('Historical Doublelift/Caps cross-league chemistry and all metadata unchanged')
