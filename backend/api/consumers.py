import json
from channels.generic.websocket import AsyncWebsocketConsumer


class SignalingConsumer(AsyncWebsocketConsumer):
    """
    Minimal WebRTC signaling relay.
    Two peers join the same room group and all messages
    are forwarded to the OTHER peer (not sender).
    Message types: offer | answer | ice_candidate | peer_left
    """

    async def connect(self):
        self.room_id = self.scope['url_route']['kwargs']['room_id']
        self.group = f'room_{self.room_id}'
        self.username = (
            self.scope['user'].username
            if self.scope['user'].is_authenticated
            else 'anonymous'
        )

        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

        # Tell the other peer someone joined
        await self.channel_layer.group_send(self.group, {
            'type': 'peer_event',
            'payload': {'type': 'peer_joined', 'username': self.username},
            'exclude': self.channel_name,
        })

    async def disconnect(self, code):
        await self.channel_layer.group_send(self.group, {
            'type': 'peer_event',
            'payload': {'type': 'peer_left', 'username': self.username},
            'exclude': self.channel_name,
        })
        await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        # Relay everything to the other peer
        await self.channel_layer.group_send(self.group, {
            'type': 'peer_event',
            'payload': data,
            'exclude': self.channel_name,
        })

    # Channel layer handler
    async def peer_event(self, event):
        if event.get('exclude') == self.channel_name:
            return
        await self.send(text_data=json.dumps(event['payload']))
