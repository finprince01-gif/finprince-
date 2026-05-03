"""bank_upload/urls.py"""

from django.urls import path
from .views import (
    BankUploadView,
    BankSessionView,
    BankRowUpdateView,
    BankPostView,
    BankStagingListView,
    BankStagingDetailView,
    BankStagingProcessView,
)

urlpatterns = [
    # ── New Staging Layer (Deferred Processing) ──
    path('staging/',                         BankStagingListView.as_view(),    name='bank-staging-list'),
    path('staging/<int:pk>/',                BankStagingDetailView.as_view(),  name='bank-staging-detail'),
    path('staging/<int:pk>/process/',        BankStagingProcessView.as_view(), name='bank-staging-process'),

    # ── Existing Processing Flow ──
    # Upload file → extract → save to staging layer
    path('upload/',                          BankUploadView.as_view(),    name='bank-upload'),

    # List / delete all rows in a session
    path('sessions/<str:session_id>/',       BankSessionView.as_view(),   name='bank-session'),

    # Update a single staging row (ledger mapping / type)
    path('rows/<int:row_id>/',               BankRowUpdateView.as_view(), name='bank-row-update'),

    # Finalize & post all mapped rows to the voucher system
    path('sessions/<str:session_id>/post/',  BankPostView.as_view(),      name='bank-post'),
]

