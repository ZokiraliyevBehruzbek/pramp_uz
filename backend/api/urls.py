from django.urls import path
from . import views

urlpatterns = [
    path('rooms/create/', views.create_room, name='create-room'),
    path('rooms/open/',   views.open_rooms,  name='open-rooms'),
    path('rooms/<str:room_id>/close/', views.close_room, name='close-room'),
]

