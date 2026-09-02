.PHONY: launch

launch:
	python3 -m http.server 8000 --directory /workspaces/paperboy
