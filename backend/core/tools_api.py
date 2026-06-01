from rest_framework import viewsets, serializers
from rest_framework.permissions import IsAuthenticated
from django.db import models

class NoteReminder(models.Model):
    user = models.ForeignKey('core.User', on_delete=models.CASCADE, db_column='user_id')
    type = models.CharField(max_length=20)
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True, null=True)
    reminder_date = models.DateTimeField(blank=True, null=True)
    is_completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = 'tools_note_reminder'

class NoteReminderSerializer(serializers.ModelSerializer):
    class Meta:
        model = NoteReminder
        fields = '__all__'
        read_only_fields = ['user', 'created_at', 'updated_at']

class NoteReminderViewSet(viewsets.ModelViewSet):
    serializer_class = NoteReminderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = NoteReminder.objects.filter(user=self.request.user).order_by('-created_at')
        item_type = self.request.query_params.get('type')
        if item_type:
            qs = qs.filter(type=item_type)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
