from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, authenticate
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Room


# ── Page views ────────────────────────────────────────────────────────────────

def home(request):
    if request.user.is_authenticated:
        return redirect('dashboard')
    return render(request, 'home.html')


def login_view(request):
    error = None
    if request.method == 'POST':
        user = authenticate(
            username=request.POST['username'],
            password=request.POST['password']
        )
        if user:
            login(request, user)
            return redirect('dashboard')
        error = 'Noto\'g\'ri login yoki parol'
    return render(request, 'login.html', {'error': error})


def register_view(request):
    error = None
    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '')
        if User.objects.filter(username=username).exists():
            error = 'Bu username band'
        elif len(password) < 4:
            error = 'Parol kamida 4 ta belgi bo\'lsin'
        else:
            user = User.objects.create_user(username=username, password=password)
            login(request, user)
            return redirect('dashboard')
    return render(request, 'register.html', {'error': error})


@login_required(login_url='/login/')
def dashboard_view(request):
    my_rooms = Room.objects.filter(host=request.user, is_active=True).order_by('-created_at')
    open_rooms = Room.objects.filter(guest__isnull=True, is_active=True).exclude(host=request.user).order_by('-created_at')[:10]
    return render(request, 'dashboard.html', {
        'my_rooms': my_rooms,
        'open_rooms': open_rooms,
    })


@login_required(login_url='/login/')
def room_view(request, room_id):
    room = get_object_or_404(Room, room_id=room_id)

    # Auto-assign guest
    if room.guest is None and room.host != request.user:
        room.guest = request.user
        room.save()

    is_host = room.host == request.user
    return render(request, 'room.html', {
        'room': room,
        'is_host': is_host,
    })


# ── REST API ──────────────────────────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_room(request):
    room = Room.objects.create(host=request.user)
    return Response({'room_id': str(room.room_id)}, status=201)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def open_rooms(request):
    rooms = Room.objects.filter(guest__isnull=True, is_active=True).exclude(host=request.user)
    data = [{'room_id': str(r.room_id), 'host': r.host.username} for r in rooms]
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def close_room(request, room_id):
    room = get_object_or_404(Room, room_id=room_id, host=request.user)
    room.is_active = False
    room.save()
    return Response({'ok': True})
