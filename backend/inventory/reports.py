"""
Inventory Reports API Views
"""
from rest_framework import views
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from datetime import datetime


class StockSummaryReportView(views.APIView):
    """Stock summary report endpoint"""
    permission_classes = [AllowAny]  # Temporary for development
    
    def get(self, request):
        # Get date parameters
        date_from = request.query_params.get('dateFrom', datetime.now().strftime('%Y-%m-%d'))
        date_to = request.query_params.get('dateTo', datetime.now().strftime('%Y-%m-%d'))
        
        # Return sample data (replace with actual database queries later)
        sample_data = [
            {
                'item_name': 'Product A',
                'opening_stock': 100,
                'inward': 50,
                'outward': 30,
                'closing_stock': 120,
                'unit': 'Pcs',
                'value': 12000
            },
            {
                'item_name': 'Product B',
                'opening_stock': 200,
                'inward': 100,
                'outward': 80,
                'closing_stock': 220,
                'unit': 'Kg',
                'value': 22000
            }
        ]
        
        return Response({
            'success': True,
            'dateFrom': date_from,
            'dateTo': date_to,
            'data': sample_data,
            'total_value': sum(item['value'] for item in sample_data)
        })
