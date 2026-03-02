"""
Registration Module URL Configuration
"""

from django.urls import path
from .api import DirectRegisterView

urlpatterns = [
    path('register/', DirectRegisterView.as_view(), name='auth-register'),  # Direct registration only
]
