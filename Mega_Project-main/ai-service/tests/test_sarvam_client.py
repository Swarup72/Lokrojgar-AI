import asyncio

import httpx
import pytest
from sarvamai import AsyncSarvamAI
from sarvamai.core.api_error import ApiError

from app.sarvam.client import get_sarvam_client, with_sarvam_retry


# --- get_sarvam_client() ---------------------------------------------------


def test_returns_none_when_no_api_key(monkeypatch):
    monkeypatch.delenv("SARVAM_API_KEY", raising=False)

    assert get_sarvam_client() is None


def test_returns_client_when_api_key_set(monkeypatch):
    monkeypatch.setenv("SARVAM_API_KEY", "test-key-1")

    client = get_sarvam_client()

    assert isinstance(client, AsyncSarvamAI)


def test_returns_same_cached_instance_for_same_key(monkeypatch):
    monkeypatch.setenv("SARVAM_API_KEY", "test-key-2")

    first = get_sarvam_client()
    second = get_sarvam_client()

    assert first is second


def test_returns_new_instance_when_key_changes(monkeypatch):
    monkeypatch.setenv("SARVAM_API_KEY", "test-key-3")
    first = get_sarvam_client()

    monkeypatch.setenv("SARVAM_API_KEY", "test-key-4")
    second = get_sarvam_client()

    assert first is not second


def test_unsetting_key_after_caching_returns_none(monkeypatch):
    monkeypatch.setenv("SARVAM_API_KEY", "test-key-5")
    assert get_sarvam_client() is not None

    monkeypatch.delenv("SARVAM_API_KEY", raising=False)

    assert get_sarvam_client() is None


# --- with_sarvam_retry() ---------------------------------------------------


def test_retry_returns_result_on_first_success():
    async def fn():
        return "ok"

    result = asyncio.run(with_sarvam_retry(fn))

    assert result == "ok"


def test_retry_succeeds_after_retryable_failures():
    attempts = {"count": 0}

    async def fn():
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise ApiError(status_code=429, body="rate limited")
        return "ok"

    result = asyncio.run(with_sarvam_retry(fn, retries=2, delay_seconds=0))

    assert result == "ok"
    assert attempts["count"] == 3


def test_retry_does_not_retry_non_retryable_status_code():
    attempts = {"count": 0}

    async def fn():
        attempts["count"] += 1
        raise ApiError(status_code=400, body="bad request")

    with pytest.raises(ApiError):
        asyncio.run(with_sarvam_retry(fn, retries=2, delay_seconds=0))

    assert attempts["count"] == 1


def test_retry_raises_after_exhausting_all_attempts():
    attempts = {"count": 0}

    async def fn():
        attempts["count"] += 1
        raise ApiError(status_code=503, body="unavailable")

    with pytest.raises(ApiError):
        asyncio.run(with_sarvam_retry(fn, retries=2, delay_seconds=0))

    assert attempts["count"] == 3  # initial attempt + 2 retries


def test_retry_retries_on_timeout_exception():
    attempts = {"count": 0}

    async def fn():
        attempts["count"] += 1
        if attempts["count"] < 2:
            raise httpx.TimeoutException("timed out")
        return "ok"

    result = asyncio.run(with_sarvam_retry(fn, retries=2, delay_seconds=0))

    assert result == "ok"
    assert attempts["count"] == 2


def test_retry_propagates_non_sarvam_exceptions_immediately():
    async def fn():
        raise ValueError("not a sarvam error")

    with pytest.raises(ValueError):
        asyncio.run(with_sarvam_retry(fn, retries=2, delay_seconds=0))
