import uuid
from django.db import models
from django.contrib.auth.models import User


class Room(models.Model):
    room_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    host = models.ForeignKey(User, on_delete=models.CASCADE, related_name='hosted')
    guest = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='joined')
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"Room {self.room_id} | host={self.host.username}"
