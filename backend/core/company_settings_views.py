"""
Company Settings View Layer
Because the app asks for /api/company-settings/, but we have a branch architecture.
This maps /api/company-settings/ to the current branch.
"""

from rest_framework import views, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .models import Branch
from .serializers import BranchSettingsSerializer

class CompanySettingsView(views.APIView):
    """
    Handles GET and PUT for /api/company-settings/
    using the current user's branch_id.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    def get_queryset(self):
        user = self.request.user
        branch_id = getattr(user, 'branch_id', None)
        return Branch.objects.filter(id=branch_id)

    def get(self, request, *args, **kwargs):
        branch = self.get_queryset().first()
        if not branch:
            return Response({'error': 'No branch associated with user'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = BranchSettingsSerializer(branch)
        return Response(serializer.data)

    def put(self, request, *args, **kwargs):
        branch = self.get_queryset().first()
        if not branch:
            return Response({'error': 'No branch associated with user'}, status=status.HTTP_404_NOT_FOUND)
            
        serializer = BranchSettingsSerializer(branch, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response(serializer.data)

    def post(self, request, *args, **kwargs):
        return self.put(request, *args, **kwargs)
