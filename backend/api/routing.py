from django.urls import re_path
from .consumers import SignalingConsumer

websocket_urlpatterns = [
    re_path(r'ws/room/(?P<room_id>[^/]+)/$', SignalingConsumer.as_asgi()),
]
