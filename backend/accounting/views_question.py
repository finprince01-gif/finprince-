from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db.models import Q
from .models_question import Question
from .serializers_question import QuestionSerializer


class QuestionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for questions.
    
    Endpoints:
    - GET /api/questions/ - List all questions
    - GET /api/questions/{id}/ - Get specific question
    - GET /api/questions/by_subgroup/?sub_group_1_1=<name> - Get questions by sub-group
    """
    queryset = Question.objects.all()
    serializer_class = QuestionSerializer
    permission_classes = [AllowAny]  # Questions are global, read-only data

    
    @action(detail=False, methods=['get'])
    def by_subgroup(self, request):
        """
        Get questions filtered by sub_group_1_1.
        
        Query params:
        - sub_group_1_1: Filter by sub-group name (e.g., "Sundry Debtors", "Bank")
        - sub_group_1_2: Filter by question code (optional)
        
        Example:
        GET /api/questions/by_subgroup/?sub_group_1_1=Bank
        """
        sub_group_1_1 = request.query_params.get('sub_group_1_1', None)
        sub_group_1_2 = request.query_params.get('sub_group_1_2', None)
        
        if not sub_group_1_1:
            return Response(
                {'error': 'sub_group_1_1 parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Filter questions
        questions = Question.objects.filter(sub_group_1_1__iexact=sub_group_1_1)
        
        if sub_group_1_2:
            questions = questions.filter(sub_group_1_2=sub_group_1_2)
        
        # Order by sub_group_1_2 (question code)
        questions = questions.order_by('sub_group_1_2', 'id')
        
        serializer = self.get_serializer(questions, many=True)
        
        return Response({
            'count': questions.count(),
            'sub_group_1_1': sub_group_1_1,
            'questions': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def search(self, request):
        """
        Search questions by keyword.
        
        Query params:
        - q: Search query
        
        Example:
        GET /api/questions/search/?q=bank
        """
        query = request.query_params.get('q', '')
        
        if not query:
            return Response(
                {'error': 'q parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Search in question text and sub_group_1_1
        questions = Question.objects.filter(
            Q(question__icontains=query) |
            Q(sub_group_1_1__icontains=query) |
            Q(sub_group_1_2__icontains=query)
        ).order_by('sub_group_1_1', 'sub_group_1_2')
        
        serializer = self.get_serializer(questions, many=True)
        
        return Response({
            'count': questions.count(),
            'query': query,
            'questions': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def subgroups(self, request):
        """
        Get list of all unique sub-groups.
        
        Example:
        GET /api/questions/subgroups/
        """
        subgroups = Question.objects.values_list('sub_group_1_1', flat=True).distinct().order_by('sub_group_1_1')
        subgroups = [sg for sg in subgroups if sg]  # Filter out None values
        
        return Response({
            'count': len(subgroups),
            'subgroups': subgroups
        })
