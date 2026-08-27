import * as THREE from 'three/webgpu';

// Every field guide now renders into the right-hand pane of a two-pane shell
// rather than the whole window, so the renderer/camera have to track that
// element's box — not window.innerWidth/innerHeight. A ResizeObserver covers
// both window resizes and layout-only changes (the console pane collapsing
// under the mobile breakpoint, a scrollbar appearing, ...).

export function bindViewport( container, camera, targets, onResize = null ) {

	function apply() {

		const w = Math.max( 1, container.clientWidth );
		const h = Math.max( 1, container.clientHeight );

		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		targets.forEach( ( t ) => { if ( t ) t.setSize( w, h ); } );
		if ( onResize ) onResize( w, h );

	}

	apply();

	if ( typeof ResizeObserver !== 'undefined' ) {

		const ro = new ResizeObserver( apply );
		ro.observe( container );

	}

	window.addEventListener( 'resize', apply );
	return apply;

}

// Visible world-space height at a given distance from a perspective camera —
// used by pages that fit a flat plane to the pane.
export function visibleHeightAt( camera, distance ) {

	return 2 * distance * Math.tan( THREE.MathUtils.degToRad( camera.fov ) / 2 );

}
