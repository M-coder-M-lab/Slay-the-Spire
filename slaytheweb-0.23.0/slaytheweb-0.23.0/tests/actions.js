// @ts-ignore
import test from 'ava'
import actions from '../src/game/actions.js'
import {createCard, CardTargets} from '../src/game/cards.js'
import {MonsterRoom} from '../src/game/rooms.js'
import {Monster} from '../src/game/monster.js'
import {createTestDungeon} from '../src/content/dungeon-encounters.js'
import {getRoomTargets, getCurrRoom, isCurrRoomCompleted} from '../src/game/utils-state.js'
import {canPlay} from '../src/game/conditions.js'

const a = actions

// Each test gets a fresh game state with a dungeon set up.
test.beforeEach((t) => {
	let state = a.createNewState()
	state = a.setDungeon(state, createTestDungeon())
	state.dungeon.y = 1
	t.context = {state}
})

test('new game state is ok', (t) => {
	const {state} = t.context
	t.true(state.dungeon.graph.length > 0, 'we have a dungeon')
	delete state.dungeon // deleting for rest of test because can't deepequal ids
	delete state.createdAt
	delete state.endedAt
	t.deepEqual(state, {
		won: false,
		turn: 1,
		deck: [],
		drawPile: [],
		hand: [],
		discardPile: [],
		exhaustPile: [],
		player: {
			maxEnergy: 3,
			currentEnergy: 3,
			maxHealth: 72,
			currentHealth: 72,
			block: 0,
			powers: {},
		},
	})
})

test('drawing a starter deck adds it to the draw pile', (t) => {
	const {state} = t.context
	t.is(state.drawPile.length, 0)
	const state2 = a.addStarterDeck(state)
	t.is(state2.drawPile.length, 10)
})

test('starter deck is shuffled', (t) => {
	const {state} = t.context
	const removeIds = (arr) =>
		arr.map((card) => {
			delete card.id
			return card
		})
	const tries = Array(10).fill(10)
	t.plan(tries.length)
	tries.forEach(() => {
		let draw1 = a.addStarterDeck(state)
		let draw2 = a.addStarterDeck(state)
		t.notDeepEqual(removeIds(draw1.drawPile), removeIds(draw2.drawPile))
	})
})

test('can add a card to hand', (t) => {
	let {state} = t.context
	const strike = createCard('Strike')
	state = a.addCardToHand(state, {card: strike})
	t.is(state.hand.length, 1)
	t.is(state.hand[0].id, strike.id)
	t.is(strike.damage, 6)
})

test('can upgrade a card', (t) => {
	// let {state} = t.context
	const strike = createCard('Strike', true)
	// state = a.addCardToHand(state, {card: strike})
	// const state2 = a.upgradeCard(state, {card: strike})
	// const strike2 = state2.hand.find(c => c.id === strike.id)
	// console.log(state2.hand)
	t.is(strike.damage, 9, 'can upgrade card')
})

test('can draw cards from drawPile to hand', (t) => {
	const {state} = t.context
	const state2 = a.addStarterDeck(state)
	t.is(state2.hand.length, 0, 'hand is empty to start with')
	const state3 = a.drawCards(state2)
	t.is(state3.hand.length, 5, 'cards have been added to the hand')
	t.is(state3.drawPile.length, 5, 'cards have been removed from deck')
})

test('recycling the discard pile is shuffled', (t) => {
	const getIds = (arr) => arr.map((card) => card.id)
	let {state} = t.context
	state = a.addStarterDeck(state)
	state = a.drawCards(state)
	let thirdDraw = a.endTurn(state)
	thirdDraw = a.endTurn(thirdDraw)
	t.notDeepEqual(getIds(state.hand), getIds(thirdDraw.hand), 'order is maintained')
})

test('getTargets utility works', (t) => {
	const {state} = t.context
	let room = getCurrRoom(state)
	t.deepEqual(getRoomTargets(state, 'enemy0')[0], room.monsters[0])
	state.dungeon.y = 2
	room = getCurrRoom(state)
	t.deepEqual(getRoomTargets(state, 'enemy1')[0], room.monsters[1])
	t.throws(() => getRoomTargets(state, 'doesntexist'))
	t.deepEqual(getRoomTargets(state, 'player')[0], state.player)
	t.deepEqual(getRoomTargets(state, 'player0')[0], state.player)
})

test('can manipulate player hp', (t) => {
	const {state} = t.context
	t.is(state.player.currentHealth, 72)
	const state2 = a.removeHealth(state, {target: 'player', amount: 10})
	t.is(state2.player.currentHealth, 62, 'can remove hp')
	t.is(state.player.currentHealth, 72, 'immutable')
	const state3 = a.addHealth(state2, {target: 'player', amount: 20})
	t.is(state3.player.currentHealth, 72, 'cant go above maxhealth')
	t.is(state2.player.currentHealth, 62, 'immutable')
	t.is(state.player.currentHealth, 72, 'immutable')
})

test('can manipulate monster hp', (t) => {
	const {state} = t.context
	t.is(getRoomTargets(state, 'enemy0')[0].currentHealth, 42, 'og heath is ok')

	const state2 = a.removeHealth(state, {target: 'enemy0', amount: 10})
	t.is(getRoomTargets(state2, 'enemy0')[0].currentHealth, 32, 'can remove hp')
	t.is(getRoomTargets(state, 'enemy0')[0].currentHealth, 42, 'immutable')

	const state3 = a.removeHealth(state2, {target: 'enemy0', amount: 10})
	t.is(getRoomTargets(state3, 'enemy0')[0].currentHealth, 22, 'can remove hp')
	t.is(getRoomTargets(state2, 'enemy0')[0].currentHealth, 32, 'immutable')
	t.is(getRoomTargets(state, 'enemy0')[0].currentHealth, 42, 'immutable')
})

test('can not play a card without enough energy', (t) => {
	const {state} = t.context
	const card = createCard('Strike')
	t.is(state.player.currentEnergy, 3)
	state.player.currentEnergy = 0
	t.throws(() => a.playCard(state, {card}))
})

test('initial rooms monster hp is STILL as expected', (t) => {
	const {state} = t.context
	t.is(getRoomTargets(state, 'enemy0')[0].currentHealth, 42)
	t.is(state.dungeon.graph[1][0].room.monsters[0].currentHealth, 42, 'this is the same')
})

test('can play a strike card from hand and see the effects on state', (t) => {
	const {state} = t.context
	const originalHealth = getRoomTargets(state, 'enemy0')[0].currentHealth
	t.is(getRoomTargets(state, 'enemy0')[0].currentHealth, originalHealth)
	const card = createCard('Strike')
	const state2 = a.playCard(state, {target: 'enemy0', card})
	t.is(getRoomTargets(state, 'enemy0')[0].currentHealth, originalHealth)
	t.is(getRoomTargets(state2, 'enemy0')[0].currentHealth, originalHealth - card.damage)
})

test('weak makes you deal 25% less damage', (t) => {
	let {state} = t.context
	t.is(getRoomTargets(state, 'enemy0')[0].currentHealth, 42)
	const card = createCard('Strike')
	let nextState = a.playCard(state, {target: 'enemy0', card})
	t.is(getRoomTargets(nextState, 'enemy0')[0].currentHealth, 36)
	t.is(getRoomTargets(nextState, 'player')[0].powers.weak, 0 || undefined)
	nextState = a.setPower(nextState, {target: 'player', power: 'weak', amount: 1})
	t.is(nextState.player.powers.weak, 1)
	nextState = a.playCard(nextState, {target: 'enemy0', card})
	t.is(
		getRoomTargets(nextState, 'enemy0')[0].currentHealth,
		32,
		'weak is rounded down. 25% of 6 is 4.5, so we deal 4 damage',
	)
})

test('weak makes a monster deal 25% less damage', (t) => {
	let {state} = t.context
	t.is(getRoomTargets(state, 'player')[0].currentHealth, 72)

	t.deepEqual(
		getRoomTargets(state, 'enemy0')[0].intents[1],
		{damage: 10},
		'second turn monster will deal 10 damage',
	)

	let nextState = a.endTurn(state)
	nextState = a.setPower(nextState, {target: 'enemy0', power: 'weak', amount: 1})
	t.is(getRoomTargets(nextState, 'enemy0')[0].powers.weak, 1)

	const finalTurn = a.endTurn(nextState)
	t.is(getRoomTargets(finalTurn, 'player')[0].currentHealth, 65)
})

test('block on enemy actually blocks damage', (t) => {
	const {state} = t.context
	const card = createCard('Strike')

	getRoomTargets(state, 'enemy0')[0].block = 10
	getRoomTargets(state, 'enemy0')[0].currentHealth = 12
	t.is(card.damage, 6)

	const state2 = a.playCard(state, {target: 'enemy0', card})
	t.is(getRoomTargets(state2, 'enemy0')[0].block, 10 - 6, 'block was reduced')
	t.is(getRoomTargets(state2, 'enemy0')[0].currentHealth, 12, 'so hp wasnt removed')
})

test('block on player actually blocks damage', (t) => {
	const {state} = t.context
	t.is(state.player.block, 0)

	const state2 = a.playCard(state, {card: createCard('Defend')})
	t.is(state2.player.block, 5)

	const state3 = a.endTurn(state2)
	t.is(getRoomTargets(state3, 'player')[0].block, 0, 'block was reduced')
	t.is(getRoomTargets(state3, 'player')[0].currentHealth, 72, 'so hp was not reduced')
})

test('can play a defend card from hand and see the effects on state', (t) => {
	const {state} = t.context
	t.is(state.player.block, 0)
	const card = createCard('Defend')
	const state2 = a.playCard(state, {card})
	t.is(state2.player.block, 5)
	const state3 = a.playCard(state2, {card})
	t.is(state3.player.block, 10)
})

test('when monster reaches 0 hp, you win!', (t) => {
	const {state} = t.context
	t.false(isCurrRoomCompleted(state))
	const newState = a.removeHealth(state, {target: 'enemy0', amount: 42})
	t.true(isCurrRoomCompleted(newState))
})

test('can discard a single card from hand', (t) => {
	const {state} = t.context
	const state2 = a.addStarterDeck(state)
	const state3 = a.drawCards(state2)
	t.is(state3.hand.length, 5)
	t.is(state3.discardPile.length, 0)
	const cardToDiscard = state3.hand[0]
	const state4 = a.discardCard(state3, {card: cardToDiscard})
	t.is(state4.hand.length, 4)
	t.is(state4.discardPile.length, 1)
})

test('can discard the entire hand', (t) => {
	const {state} = t.context
	const state2 = a.addStarterDeck(state)
	const state3 = a.drawCards(state2)
	t.is(state3.hand.length, 5)
	t.is(state3.discardPile.length, 0)
	const state4 = a.discardHand(state3)
	t.is(state4.hand.length, 0)
	t.is(state4.discardPile.length, 5)
})

test('we can end an encounter with reshuffle and draw', (t) => {
	let {state} = t.context
	const state2 = a.addStarterDeck(state)
	const state3 = a.drawCards(state2)
	const state4 = a.discardHand(state3)
	t.is(state4.discardPile.length, 5)
	const state5 = a.endEncounter(state4)
	t.is(state5.hand.length, 5)
	t.is(state5.discardPile.length, 0)
})

test('ending a turn draws a new hand and recycles discard pile', (t) => {
	let {state} = t.context

	state = a.addStarterDeck(state)
	t.is(state.drawPile.length, 10)
	t.is(state.hand.length, 0)
	t.is(state.discardPile.length, 0)

	state = a.drawCards(state)
	t.is(state.drawPile.length, 5)
	t.is(state.hand.length, 5)
	t.is(state.discardPile.length, 0)

	state = a.endTurn(state)
	t.is(state.drawPile.length, 0)
	t.is(state.hand.length, 5)
	t.is(state.discardPile.length, 5)

	// now there is nothing in draw pile, so it should recycle discard pile.
	state = a.endTurn(state)
	t.is(state.drawPile.length, 5)
	t.is(state.hand.length, 5)
	t.is(state.discardPile.length, 0)
})

test('ending a turn refreshes energy', (t) => {
	const {state} = t.context
	t.is(state.player.currentEnergy, 3)
	const card = createCard('Defend')
	const state2 = a.playCard(state, {card})
	t.is(state2.player.currentEnergy, 2)
	const state3 = a.playCard(state2, {card})
	t.is(state3.player.currentEnergy, 1)
	const newTurn = a.endTurn(state3)
	t.is(newTurn.player.currentEnergy, 3)
})

test("ending a turn removes player's block", (t) => {
	const {state} = t.context
	t.is(state.player.block, 0)
	const card = createCard('Defend')
	const state2 = a.playCard(state, {card})
	t.is(state2.player.block, 5)
	const state3 = a.playCard(state2, {card})
	t.is(state3.player.block, 10)
	const newTurn = a.endTurn(state3)
	t.is(newTurn.player.block, 0)
})

test('Vulnerable targets take 50% more damage', (t) => {
	let {state} = t.context
	const bashCard = createCard('Bash')
	const strikeCard = createCard('Strike')
	t.is(getRoomTargets(state, 'enemy0')[0].currentHealth, 42, 'initial hp')
	state = a.playCard(state, {target: 'enemy0', card: bashCard})
	t.is(getRoomTargets(state, 'enemy0')[0].currentHealth, 34)
	state = a.playCard(state, {target: 'enemy0', card: strikeCard})
	t.is(getRoomTargets(state, 'enemy0')[0].currentHealth, 25, 'deals 50% more damage')
})

test('Vulnerable damage is rounded down', (t) => {
	let {state} = t.context
	const strike = createCard('Strike')
	strike.damage = 9
	getRoomTargets(state, 'enemy0')[0].powers.vulnerable = 1
	let state2 = a.playCard(state, {target: 'enemy0', card: strike})
	t.is(getRoomTargets(state2, 'enemy0')[0].currentHealth, 42 - 13)
})

test('Vulnerable power stacks', (t) => {
	let {state} = t.context
	const card = createCard('Bash')
	state.player.currentEnergy = 999
	state = a.playCard(state, {target: 'enemy0', card})
	t.is(getRoomTargets(state, 'enemy0')[0].powers.vulnerable, card.powers.vulnerable)
	state = a.playCard(state, {target: 'enemy0', card})
	t.is(getRoomTargets(state, 'enemy0')[0].powers.vulnerable, card.powers.vulnerable * 2)
})

test('Regen power stacks', (t) => {
	let {state} = t.context
	const card = createCard('Flourish')
	state.player.currentEnergy = 999
	state = a.playCard(state, {target: 'player', card})
	t.is(state.player.powers.regen, card.powers.regen, 'regen applied once')
	state = a.playCard(state, {target: 'player', card})
	t.is(state.player.powers.regen, card.powers.regen * 2, 'regen applied twice')
})

test('Flourish card adds a healing "regen" buff', (t) => {
	let {state} = t.context
	const flourish = createCard('Flourish')
	t.is(flourish.powers.regen, 5, 'card has regen power')
	t.is(state.player.currentHealth, 72)
	let state2 = a.playCard(state, {target: 'player', card: flourish})

	t.is(state2.player.powers.regen, flourish.powers.regen, 'regen is applied to player')
	state2 = a.endTurn(state2)
	t.is(state2.player.currentHealth, 72, 'it doesnt go above max hp')
	t.is(state2.player.powers.regen, 4, 'stacks go down')
	// state2.player.currentHealth = 10
	const x = a.setHealth(state2, {target: 'player', amount: 10})
	// state2 = a.endTurn(x)
	t.is(x.player.currentHealth, 10)
	t.is(state2.player.currentHealth, 72)
	// t.is(state2.player.powers.regen, 3)
	// state2 = a.endTurn(state2)
	// t.is(state2.player.currentHealth, 17)
	// t.is(state2.player.powers.regen, 2)
	// state2 = a.endTurn(state2)
	// t.is(state2.player.currentHealth, 19)
	// t.is(state2.player.powers.regen, 1)
	// state2 = a.endTurn(state2)
	// t.is(state2.player.currentHealth, 20)
	// t.is(state2.player.powers.regen, 0)
	// state2 = a.endTurn(state2)
	// t.is(state2.player.currentHealth, 20)
})

test('target "allEnemies" works for damage as well as power', (t) => {
	const {state} = t.context
	state.dungeon.y++
	const room = getCurrRoom(state)
	t.is(room.monsters.length, 2, 'we have two enemies')
	t.is(room.monsters[0].currentHealth, 24)
	t.is(room.monsters[1].currentHealth, 13)
	t.falsy(room.monsters[0].powers.vulnerable && room.monsters[1].powers.vulnerable, 'none are vulnerable')
	const card = createCard('Thunderclap')
	const nextState = a.playCard(state, {card})
	t.is(getRoomTargets(nextState, 'enemy0')[0].currentHealth, 24 - card.damage)
	t.is(getRoomTargets(nextState, 'enemy1')[0].currentHealth, 13 - card.damage)
	t.is(getRoomTargets(nextState, 'enemy0')[0].powers.vulnerable, 1)
	t.is(getRoomTargets(nextState, 'enemy1')[0].powers.vulnerable, 1)
})

test('add a reward card in the deck after winning a room', (t) => {
	// arrange
	let {state} = t.context
	state = a.addStarterDeck(state)
	state = a.drawCards(state)
	const room = MonsterRoom(Monster(), Monster({hp: 20}))
	room.monsters.forEach((monster) => (monster.currentHealth = 0))
	const card = createCard('Strike')
	t.is(state.deck.length, 10)
	// act
	const newState = a.addCardToDeck(state, {card})
	// assert
	t.is(newState.deck.length, 11)
})

test('can not play card if target doesnt match', (t) => {
	const {state} = t.context
	const card = createCard('Strike')
	t.throws(() => {
		a.playCard(state, {card, target: 'yolo'})
	})
	t.throws(() => {
		a.playCard(state, {card, target: 'enemy1'})
	})
	t.throws(() => {
		a.playCard(state, {card, target: 'naaah'})
	})
	a.playCard(state, {card, target: 'player'})
})

test('summer of sam card gains 1 life', (t) => {
	const {state} = t.context
	const card = createCard('Summer of Sam')
	t.is(card.actions.length, 2, 'card has "actions"')
	t.is(state.player.maxHealth, 72)
	const state2 = a.playCard(state, {target: 'player', card})
	t.is(state2.player.currentHealth, 72, 'gain 1 life')

	const test3 = a.removeHealth(state2, {target: 'player', amount: 72 / 2 + 5})
	t.is(test3.player.currentHealth, 31)
	const test4 = a.playCard(test3, {target: 'player', card})
	t.is(test4.player.currentHealth, 33, 'gain 2 life, because hp was below 50%')
})

test('vulnerable is working', (t) => {
	const {state} = t.context
	state.player.powers.vulnerable = 1
	getRoomTargets(state, 'enemy0')[0].intents = [{damage: 10}]
	let newState = a.endTurn(state)
	t.is(newState.player.currentHealth, 72 - 15)
})

test('Cleave targets all monsters', (t) => {
	const cleave = createCard('Cleave')
	t.is(cleave.target, CardTargets.allEnemies)
})

test('Clash can only be played if it is the only attack', (t) => {
	const {state} = t.context
	const clash = createCard('Clash')

	// It has the righ condition.
	t.is(clash.conditions[0].type, 'onlyType')
	t.is(clash.conditions[0].cardType, 'attack')

	t.is(canPlay(state, clash), false, 'can not play because not in hand')

	state.hand.push(clash)
	t.is(canPlay(state, clash), true, 'can play because in hand')

	const defend = createCard('Defend')
	state.hand.push(defend)
	t.is(canPlay(state, clash), false, 'can not play because non-attack card in hand')
})

test('Succube card applies regen', (t) => {
	const {state} = t.context
	const succube = createCard('Succube')
	const newstate = actions.playCard(state, {card: succube, target: 'enemy0'})
	t.is(newstate.player.powers.regen, 2)
})

test('upgraded cards are really upgraded', (t) => {
	let state = a.createNewState()
	state = a.addStarterDeck(state)
	t.is(state.deck[9].name, 'Bash')
	state = a.upgradeCard(state, {card: state.deck[9]})
	t.is(state.deck[9].name, 'Bash+')
})

test.todo('playing defend on an enemy ?')
test.todo('can apply a power to a specific monster')

test('"Deal damage equal to block" mechanic works', (t) => {
	const {state} = t.context
	t.is(state.player.currentHealth, 72)
	t.is(getRoomTargets(state, 'enemy0')[0].currentHealth, 42)
	const state2 = a.playCard(state, {card: createCard('Defend'), target: 'player'})
	t.is(state2.player.block, 5)
	const state3 = a.playCard(state2, {card: createCard('Body Slam'), target: 'enemy0'})
	t.is(getRoomTargets(state3, 'enemy0')[0].currentHealth, 42 - 5)
})

test('setDeck sets a custom deck', (t) => {
	const {state} = t.context
	const cardNames = ['Strike', 'Defend', 'Bash', 'Intimidate', 'Bludgeon']

	// Set a custom deck
	const newState = a.setDeck(state, {cardNames})

	// Check deck length matches cardNames length
	t.is(newState.deck.length, cardNames.length)

	// Check drawPile has same number of cards
	t.is(newState.drawPile.length, cardNames.length)

	// Check all card names in the deck match what we provided
	const deckCardNames = newState.deck.map((card) => card.name)
	t.deepEqual(deckCardNames.sort(), cardNames.sort())

	// Verify drawPile contains the same cards as deck (but possibly in different order)
	const drawPileCardNames = newState.drawPile.map((card) => card.name)
	t.deepEqual(drawPileCardNames.sort(), cardNames.sort())

	// Verify the drawPile is shuffled (not in the same order as deck)
	// Note: This could occasionally fail if the shuffle happens to return the same order
	const getIds = (arr) => arr.map((card) => card.id)
	t.notDeepEqual(getIds(newState.deck), getIds(newState.drawPile))
})
