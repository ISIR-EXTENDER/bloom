SHELL := /bin/bash

.PHONY: test
test: ## Run backend unit tests without external pytest plugin leakage
	@PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 uv run pytest

.PHONY: run
run: ## Run the Bloom API locally
	@uv run uvicorn apps.bloom_api.main:app --reload

.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
