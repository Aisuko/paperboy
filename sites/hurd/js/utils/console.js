// The left-hand process console shared by every page of a field guide.
//
// It is deliberately dumb: worlds push lines into it, it renders and scrolls
// them. `stream()` types a list of lines out one at a time so a boot log or a
// calculation trace reads as something that is *happening* rather than a
// block of static text, and returns a handle so a page switch can cancel a
// stream that is still in flight.

const KINDS = new Set( [ 'out', 'cmd', 'ok', 'warn', 'err', 'dim', 'calc', 'note', 'head' ] );

export class ProcessConsole {

	constructor( root ) {

		this.root = root;
		this.titleEl = root.querySelector( '.console-title' );
		this.statusEl = root.querySelector( '.console-status' );
		this.statusTextEl = root.querySelector( '.console-status .text' );
		this.bodyEl = root.querySelector( '.console-body' );
		this.footEl = root.querySelector( '.console-foot' );
		this._timer = null;
		this._maxLines = 400;

	}

	setTitle( text ) {

		this.titleEl.textContent = text;

	}

	// state: 'idle' | 'running' | 'done' | 'error'
	setStatus( text, state = 'idle' ) {

		this.statusTextEl.textContent = text;
		this.statusEl.dataset.state = state;

	}

	clear() {

		this.cancel();
		this.bodyEl.innerHTML = '';

	}

	rule() {

		const hr = document.createElement( 'div' );
		hr.className = 'log-line log-rule';
		this.bodyEl.appendChild( hr );
		this._trim();
		this._scroll();

	}

	// `text` may contain <b> and <em> — nothing else is allowed through, so
	// user-typed shell input can never inject markup into the log.
	write( text, kind = 'out', { gutter = '' } = {} ) {

		if ( text === null || text === undefined ) return null;
		if ( kind === 'rule' ) { this.rule(); return null; }

		const line = document.createElement( 'div' );
		line.className = 'log-line log-' + ( KINDS.has( kind ) ? kind : 'out' );

		if ( kind === 'head' ) {

			line.textContent = text;
			this.bodyEl.appendChild( line );
			this._trim();
			this._scroll();
			return line;

		}

		const gut = document.createElement( 'span' );
		gut.className = 'gutter';
		gut.textContent = gutter || ( kind === 'cmd' ? '$' : '' );

		const body = document.createElement( 'span' );
		body.className = 'body';
		body.append( ...markup( String( text ) ) );

		line.append( gut, body );
		this.bodyEl.appendChild( line );
		this._trim();
		this._scroll();
		return line;

	}

	// Writes several lines at once, no typing delay.
	writeAll( lines ) {

		lines.forEach( ( l ) => this.write( l.text, l.kind, l ) );

	}

	// Types `lines` out one at a time. onLine(line, index) fires per line so a
	// world can sync its 3D state to the log; onDone fires at the end.
	stream( lines, { interval = 260, onLine = null, onDone = null } = {} ) {

		this.cancel();
		let i = 0;

		const tick = () => {

			if ( i >= lines.length ) {

				this.cancel();
				if ( onDone ) onDone();
				return;

			}

			const line = lines[ i ];
			this.write( line.text, line.kind, line );
			if ( onLine ) onLine( line, i );
			i ++;

		};

		tick();
		if ( lines.length > 1 ) this._timer = setInterval( tick, interval );
		else if ( onDone ) onDone();

	}

	cancel() {

		if ( this._timer ) { clearInterval( this._timer ); this._timer = null; }

	}

	isStreaming() {

		return this._timer !== null;

	}

	_trim() {

		while ( this.bodyEl.childElementCount > this._maxLines ) {

			this.bodyEl.removeChild( this.bodyEl.firstElementChild );

		}

	}

	_scroll() {

		this.bodyEl.scrollTop = this.bodyEl.scrollHeight;

	}

}

// Turns the tiny <b>/<em> subset used by log copy into real nodes, treating
// everything else as literal text.
function markup( text ) {

	const out = [];
	const re = /<(b|em)>([\s\S]*?)<\/\1>/g;
	let last = 0;
	let m;

	while ( ( m = re.exec( text ) ) !== null ) {

		if ( m.index > last ) out.push( document.createTextNode( text.slice( last, m.index ) ) );
		const el = document.createElement( m[ 1 ] );
		el.textContent = m[ 2 ];
		out.push( el );
		last = m.index + m[ 0 ].length;

	}

	if ( last < text.length ) out.push( document.createTextNode( text.slice( last ) ) );
	return out;

}
