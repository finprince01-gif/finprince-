import pytest
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

@pytest.mark.django_db
def test_health_check():
    client = APIClient()
    url = reverse('health')
    response = client.get(url)
    assert response.status_code == status.HTTP_200_OK
    assert response.data['status'] == 'ok'

@pytest.mark.django_db
def test_public_endpoints_accessible():
    client = APIClient()
    # Test phone check which should be AllowAny
    url = reverse('check-phone')
    response = client.get(url + '?phone=1234567890')
    assert response.status_code == status.HTTP_200_OK

@pytest.mark.django_db
def test_authenticated_endpoint_requires_token():
    client = APIClient()
    # Test check-status which should be IsAuthenticated
    url = reverse('check-status')
    response = client.get(url)
    assert response.status_code == status.HTTP_403_FORBIDDEN
