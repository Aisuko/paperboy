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

