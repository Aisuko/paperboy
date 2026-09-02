import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createBar, setBar, tintBar } from '../utils/tensorKit.js';
import { SHOWN, GPT2, TAIL_LOGIT } from '../data/model.js';

const SPACING = 0.8;
const PROB_SCALE = 5.0;
const BAR_TOP = 2.6;
const CUM_SCALE = 2.9;
const LOGIT_BASE = -4;
const LOGIT_SCALE = 0.5;

const VIEWS = [
	{ position: new THREE.Vector3( 0, 2.2, 15.8 ), target: new THREE.Vector3( 0, 1.4, 0 ) },
	{ position: new THREE.Vector3( 0, 2.2, 15.4 ), target: new THREE.Vector3( 0, 1.4, 0 ) },
	{ position: new THREE.Vector3( 0, 2.2, 15.2 ), target: new THREE.Vector3( 0, 1.4, 0 ) },
	{ position: new THREE.Vector3( 0, 2.3, 15.2 ), target: new THREE.Vector3( 0, 1.5, 0 ) },
	{ position: new THREE.Vector3( -0.5, 2.3, 15.0 ), target: new THREE.Vector3( -0.5, 1.5, 0 ) },
	{ position: new THREE.Vector3( -0.3, 2.5, 15.4 ), target: new THREE.Vector3( -0.3, 1.6, 0 ) },
	{ position: new THREE.Vector3( 0, 2.5, 15.8 ), target: new THREE.Vector3( 0, 1.6, 0 ) },
];

export function buildSoftmaxWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 60, { y: -1.6, divisions: 60 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];

	const count = SHOWN.vocab + 1;
	const xAt = ( i ) => ( i - ( count - 1 ) / 2 ) * SPACING;

	const bars = [];
	const ghosts = [];
	const tokenLabels = [];
	const valueLabels = [];

	for ( let i = 0; i < count; i ++ ) {

		const bar = createBar( { width: 0.52, depth: 0.52, color: THEME.accent } );
		bar.position.set( xAt( i ), 0, 0 );
		bar.userData.rank = i;
		rig.add( bar );
		bars.push( bar );
		interactables.push( bar );

		const ghost = new THREE.Mesh(
			new THREE.BoxGeometry( 0.62, 1, 0.62 ),
			new THREE.MeshBasicMaterial( { color: THEME.muted, transparent: true, opacity: 0.14, wireframe: true } ),
		);
		ghost.geometry.translate( 0, 0.5, 0 );
		ghost.position.set( xAt( i ), 0, 0 );
		ghost.visible = false;
		rig.add( ghost );
		ghosts.push( ghost );

		const token = createLabel( '', 'label2d label2d-dim' );
		token.position.set( xAt( i ), -0.18, 0 );
		rig.add( token );
		tokenLabels.push( token );

		const value = createLabel( '', 'label2d label2d-dim' );
		rig.add( value );
		valueLabels.push( value );

	}

	const cumGeo = new THREE.BufferGeometry().setFromPoints( Array.from( { length: count }, () => new THREE.Vector3() ) );
	const cumLine = new THREE.Line( cumGeo, new THREE.LineBasicMaterial( { color: THEME.signal, transparent: true, opacity: 0.9 } ) );
	rig.add( cumLine );

	const cumDots = [];
	for ( let i = 0; i < count; i ++ ) {

		const dot = new THREE.Mesh(
			new THREE.SphereGeometry( 0.07, 12, 12 ),
			new THREE.MeshStandardMaterial( { color: THEME.signal, emissive: THEME.signal, emissiveIntensity: 0.7 } ),
		);
		rig.add( dot );
		cumDots.push( dot );

	}

	const pLine = new THREE.Mesh(
		new THREE.BoxGeometry( count * SPACING, 0.02, 0.02 ),
		new THREE.MeshBasicMaterial( { color: THEME.signal, transparent: true, opacity: 0.6 } ),
	);
	rig.add( pLine );

	const pLabel = createLabel( '', 'label2d label2d-key' );
	rig.add( pLabel );

	const cutPlane = new THREE.Mesh(
		new THREE.BoxGeometry( 0.03, 3.6, 1.4 ),
		new THREE.MeshBasicMaterial( { color: THEME.rose, transparent: true, opacity: 0.45 } ),
	);
	cutPlane.position.y = 1.8;
	rig.add( cutPlane );

	const cutLabel = createLabel( '', 'label2d label2d-key' );
	rig.add( cutLabel );

	const sumLabel = createLabel( '', 'label2d label2d-key' );
	sumLabel.position.set( 2.6, 4.3, 0 );
	rig.add( sumLabel );

	const stageLabel = createLabel( '', 'label2d label2d-dim' );
	stageLabel.position.set( -3.0, 4.3, 0 );
	rig.add( stageLabel );

	let step = 0;
	let result = null;
	let sampled = -1;

	function shownValue( row ) {

		if ( step === 0 ) return row.logit;
		if ( step === 1 ) return row.exp;
		if ( step <= 3 ) return row.prob;
		return row.kept ? row.final : row.prob;

	}

	function heightFor( row, scale ) {

		if ( step === 0 ) return Math.max( 0.02, ( row.logit - LOGIT_BASE ) * LOGIT_SCALE );
		return Math.max( 0.02, Math.min( 3.4, shownValue( row ) * scale ) );

	}

	function labelFor( row ) {

		if ( step === 0 ) return `${ row.logit >= 0 ? '+' : '' }${ row.logit.toFixed( 2 ) }`;
		if ( step === 1 ) return row.exp.toFixed( 3 );
		if ( step <= 3 ) return row.prob.toFixed( 3 );
		return row.kept ? row.final.toFixed( 3 ) : '—';

	}

	const STAGE_TEXT = [
		'stage: raw logits z',
		'stage: exp(z − max z)',
		'stage: p = exp / Σ exp',
		'stage: softmax(z / T)',
		'stage: top-k mask → renormalise',
		'stage: top-p nucleus → renormalise',
		'stage: temperature → softmax → top-k → top-p',
	];

	function render() {

		const all = result.all;
		const filtering = step >= 4;
		const peak = Math.max( ...result.rows.map( shownValue ) );
		const scale = peak > 0 ? BAR_TOP / peak : PROB_SCALE;

		all.forEach( ( row, i ) => {

			const h = heightFor( row, scale );
			setBar( bars[ i ], h );

			const isSampled = i === sampled;
			const dropped = filtering && ! row.kept;
			const color = isSampled ? THEME.signal : dropped || row.isTail ? THEME.muted : i === 0 ? THEME.accent : THEME.violet;
			tintBar( bars[ i ], color, dropped ? 0.05 : isSampled ? 1.0 : 0.45 );

			ghosts[ i ].visible = filtering && row.kept;
			ghosts[ i ].scale.y = Math.max( 0.02, Math.min( 3.4, row.prob * scale ) );

			tokenLabels[ i ].element.textContent = row.isTail ? '50,245 others' : row.token.trim();
			tokenLabels[ i ].element.className = dropped ? 'label2d label2d-dim' : row.isTail ? 'label2d label2d-dim' : 'label2d';

			valueLabels[ i ].position.set( xAt( i ), h + 0.28, 0 );
			valueLabels[ i ].element.textContent = labelFor( row );
			valueLabels[ i ].element.className = 'label2d label2d-dim';

			const cy = Math.min( row.rawCum, 1 ) * CUM_SCALE;
			cumDots[ i ].position.set( xAt( i ), cy, 0.4 );
			cumGeo.attributes.position.setXYZ( i, xAt( i ), cy, 0.4 );

		} );

		cumGeo.attributes.position.needsUpdate = true;
		cumGeo.computeBoundingSphere();

		const showCum = step >= 5 || result.mode === 'p' || result.mode === 'both';
		cumLine.visible = showCum;
		cumDots.forEach( ( d ) => { d.visible = showCum; } );
		pLine.visible = showCum;
		pLabel.visible = showCum;
		pLine.position.set( 0, result.topP * CUM_SCALE, 0.4 );
		pLabel.position.set( xAt( count - 1 ) + 0.2, result.topP * CUM_SCALE, 0.4 );
		pLabel.element.textContent = `p = ${ result.topP.toFixed( 2 ) }`;

		const showCut = step >= 4 && ( result.mode === 'k' || result.mode === 'both' );
		cutPlane.visible = showCut;
		cutLabel.visible = showCut;
		const cutX = xAt( result.topK - 1 ) + SPACING / 2;
		cutPlane.position.x = cutX;
		cutLabel.position.set( cutX, 3.9, 0 );
		cutLabel.element.textContent = `k = ${ result.topK }`;

		sumLabel.element.textContent = step <= 3
			? `Σ p = ${ result.all.reduce( ( s, r ) => s + r.prob, 0 ).toFixed( 3 ) }`
			: `${ result.keptCount.toLocaleString( 'en-AU' ) } candidates kept · Σ = 1.000`;
		sumLabel.visible = step >= 2;

		stageLabel.element.textContent = `${ STAGE_TEXT[ step ] }${ step === 0 ? '' : '   ·   heights relative to the tallest drawn token' }`;

	}

	return {
		scene,
		interactables,
		stepCount: 7,
		defaultView: VIEWS[ 0 ],
		getStepView( i ) { return VIEWS[ Math.max( 0, Math.min( VIEWS.length - 1, i ) ) ]; },
		setResult( next ) {

			result = next;
			render();

		},
		setStep( i ) {

			step = i;
			sampled = -1;
			if ( result ) render();

		},
		setSampled( index ) {

			sampled = index;
			if ( result ) render();

		},
		describe( object ) {

			const row = result.all[ object.userData.rank ];
			if ( row.isTail ) return {
				category: 'the rest of the vocabulary',
				name: `${ result.tailCount.toLocaleString( 'en-AU' ) } other tokens`,
				blurb: `every entry outside the ${ SHOWN.vocab } drawn here`,
				description: `Drawn as one bar. Each is modelled at z ≈ ${ TAIL_LOGIT.toFixed( 2 ) }, so together they hold a few percent of the mass — enough to matter to the denominator, and the first thing top-k or top-p throws away.`,
				metricLabel: 'combined probability',
				metric: row.prob.toFixed( 4 ),
			};

			return {
				category: `rank ${ row.rank + 1 } of ${ GPT2.vocab.toLocaleString( 'en-AU' ) }`,
				name: `"${ row.token.trim() }"`,
				blurb: `token id ${ row.id }`,
				description: `logit ${ row.logit.toFixed( 3 ) } → z/T ${ row.scaled.toFixed( 3 ) } → p ${ row.prob.toFixed( 4 ) }. ${ row.kept ? `Kept, renormalised to ${ row.final.toFixed( 4 ) }.` : 'Cut by the current filter.' }`,
				metricLabel: 'probability',
				metric: ( row.kept ? row.final : row.prob ).toFixed( 4 ),
			};

		},
		update() {},
	};

}
