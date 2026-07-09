import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { getComponent, CATEGORIES } from '../data/components.js';
import { getTranslatorOption } from '../data/translators.js';
import { createComponentObject, pulseHeart } from '../components3d.js';
import { addStandardLighting, createStarfield, disposeObject3D, disposeLink } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';
import { tween, Easing } from '../utils/tween.js';

// The mount point (/mnt) is a pseudo-component — a plain, empty node in the
// namespace, not one of the real servers in data/components.js — until a
// translator gets attached to it.
const MOUNT_LOOK = { id: 'mnt-node', name: '/mnt', category: 'io', shape: 'module' };

const ROOT_X = -1.6;
const MOUNT_X = 0;
const TRANSLATOR_X = 3.0;

function addLabel( parent, text, y, extraClass ) {

	const label = document.createElement( 'div' );
	label.className = extraClass ? `label2d ${ extraClass }` : 'label2d';
	label.textContent = text;
	const labelObj = new CSS2DObject( label );
	labelObj.position.set( 0, y, 0 );
	parent.add( labelObj );
	return { labelObj, el: label };

}

export function buildTranslatorsWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0xffb84d );
	scene.add( createStarfield() );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = []; // mutated in place so main.js's stored `interactables` reference stays valid

	const rootComp = getComponent( 'ext2fs' );
	const rootNode = createComponentObject( rootComp );
	rootNode.position.set( ROOT_X, 0, 0 );
	rig.add( rootNode );
	interactables.push( rootNode );
	addLabel( rootNode, 'ext2fs (root)', 0.7 );

	const mountNode = createComponentObject( MOUNT_LOOK );
	mountNode.position.set( MOUNT_X, 0, 0 );
	rig.add( mountNode );
	interactables.push( mountNode );
	addLabel( mountNode, '/mnt', 0.7 );
	const mountStatus = addLabel( mountNode, 'passive translator: none', -0.7, 'label2d-dim' );

	const rootLink = new IPCLink( rig, rootNode.position.clone(), mountNode.position.clone(), CATEGORIES.filesystem.color, {
		particleCount: 1, speed: 0.22, radius: 0.014, arc: 0.3,
	} );
	rootLink.setActive( false );

	let translatorNode = null;
	let translatorLink = null;
	let attachedKey = null;
	let busy = false;
	let onChangeCb = null;

	// Fires whenever attachedKey or busy actually changes, so the DOM button
	// state can stay correct through async spawn/despawn animations instead
	// of only reflecting whatever was true the instant a click happened.
	function notify() {

		if ( onChangeCb ) onChangeCb();

	}

	function pulseRootLink() {

		rootLink.setActive( true );
		tween( 1.1, () => {}, { onComplete: () => rootLink.setActive( false ) } );

	}

	function attach( key ) {

		if ( busy || attachedKey === key ) return;
		const option = getTranslatorOption( key );
		if ( ! option ) return;

		busy = true;
		notify();
		detach( { silent: true, then: () => {

			const comp = getComponent( option.componentId );
			translatorNode = createComponentObject( comp );
			translatorNode.position.set( TRANSLATOR_X, 0, 0 );
			translatorNode.scale.setScalar( 0.0001 );
			rig.add( translatorNode );
			interactables.push( translatorNode );
			addLabel( translatorNode, comp.name, 0.7 );

			translatorLink = new IPCLink( rig, mountNode.position.clone(), translatorNode.position.clone(), CATEGORIES[ comp.category ].color, {
				particleCount: 2, speed: 0.35, radius: 0.016, arc: 0.4,
			} );

			tween( 0.55, ( t ) => {

				const s = THREE.MathUtils.lerp( 0.0001, 1, t );
				translatorNode.scale.setScalar( s );

			}, { easing: Easing.backOut, onComplete: () => { busy = false; notify(); } } );

			pulseRootLink();
			attachedKey = key;
			mountStatus.el.textContent = `active translator: ${ comp.name }`;
			notify();

		} } );

	}

	function detach( { silent = false, then } = {} ) {

		if ( ! translatorNode ) {

			attachedKey = null;
			if ( ! silent ) mountStatus.el.textContent = 'passive translator: none';
			if ( ! silent ) notify();
			if ( then ) then();
			return;

		}

		const node = translatorNode;
		const link = translatorLink;
		translatorNode = null;
		translatorLink = null;
		attachedKey = null;
		const idx = interactables.indexOf( node );
		if ( idx !== -1 ) interactables.splice( idx, 1 );
		if ( ! silent ) mountStatus.el.textContent = 'passive translator: none';

		busy = true;
		if ( ! silent ) notify();
		tween( 0.4, ( t ) => {

			const s = THREE.MathUtils.lerp( 1, 0.0001, t );
			node.scale.setScalar( s );

		}, { easing: Easing.cubicInOut, onComplete: () => {

			disposeObject3D( node );
			if ( link ) disposeLink( link );
			busy = false;
			if ( ! silent ) notify();
			if ( then ) then();

		} } );

	}

	let elapsed = 0;

	return {
		scene,
		interactables,
		defaultView: {
			position: new THREE.Vector3( 0, 4.2, 10 ),
			target: new THREE.Vector3( 0, -0.2, 0 ),
		},
		attach,
		detach: () => detach(),
		getAttachedKey: () => attachedKey,
		isBusy: () => busy,
		setOnChange: ( cb ) => { onChangeCb = cb; },
		update( dt ) {

			elapsed += dt;
			rig.children.forEach( ( child ) => {

				if ( child.userData.spin ) child.rotation.y += dt * child.userData.spin;

			} );
			[ rootNode, mountNode, translatorNode ].forEach( ( n ) => { if ( n ) pulseHeart( n, elapsed ); } );
			rootLink.update( dt );
			if ( translatorLink ) translatorLink.update( dt );

		},
	};

}
