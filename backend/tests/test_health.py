from fastapi.testclient import TestClient


def test_health_endpoint_reports_service_ready(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "bloom-api",
        "environment": "test",
    }


def test_legacy_root_health_endpoint_is_not_registered(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 404
