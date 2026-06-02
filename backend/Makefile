SHELL := /bin/bash

.PHONY: test
test: ## Run backend unit tests without external pytest plugin leakage
	@PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 uv run pytest

.PHONY: cli
cli: ## Show Bloom backend CLI help
	@uv run python -m apps.bloom_cli.main

.PHONY: api
api: ## Show Bloom API CLI help
	@uv run python -m apps.bloom_cli.main api

.PHONY: config
config: ## Show Bloom configuration CLI help
	@uv run python -m apps.bloom_cli.main config

.PHONY: api-run
api-run: ## Run the Bloom API locally through the CLI
	@uv run python -m apps.bloom_cli.main api run --reload

.PHONY: run
run: ## Run the Bloom API locally
	@$(MAKE) -s api-run

.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
