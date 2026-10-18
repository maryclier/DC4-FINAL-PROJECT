<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\StaffProfile;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class StaffController extends Controller
{
    private function authorizeAdmin(Request $request): void
    {
        abort_unless(
            $request->user()->role === 'administrator',
            403,
            'Administrator access required.'
        );
    }

    public function index(Request $request)
    {
        if ($request->user()->role !== 'administrator' &&
            !in_array($request->user()->role, [
                'receptionist', 'medical_staff',
            ], true)) {
            abort(403, 'Access denied.');
        }

        $query = StaffProfile::with('user')->latest();

        if ($request->filled('search')) {
            $search = $request->search;

            $query->where(function ($q) use ($search) {
                $q->where('staff_number', 'like', "%{$search}%")
                  ->orWhere('specialization', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($userQuery) use ($search) {
                      $userQuery->where('name', 'like', "%{$search}%");
                  });
            });
        }

        if ($request->filled('available')) {
            $query->where(
                'availability_status',
                filter_var($request->available, FILTER_VALIDATE_BOOLEAN)
            );
        }

        return $query->paginate(10);
    }

    public function store(Request $request)
    {
        $this->authorizeAdmin($request);

        $data = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'password' => [
                'required',
                'confirmed',
                Password::min(8),
            ],
            'role' => [
                'required',
                Rule::in(['receptionist', 'medical_staff']),
            ],
            'staff_number' => 'required|string|max:50|unique:staff_profiles,staff_number',
            'specialization' => 'nullable|string|max:255',
            'availability_status' => 'sometimes|boolean',
        ]);

        $profile = DB::transaction(function () use ($data) {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => Hash::make($data['password']),
                'role' => $data['role'],
            ]);

            return StaffProfile::create([
                'user_id' => $user->id,
                'staff_number' => $data['staff_number'],
                'specialization' => $data['specialization'] ?? null,
                'availability_status' => $data['availability_status'] ?? true,
            ]);
        });

        return response()->json([
            'message' => 'Staff account created.',
            'staff' => $profile->load('user'),
        ], 201);
    }

    public function show(Request $request, StaffProfile $staff)
    {
        if ($request->user()->role !== 'administrator' &&
            !in_array($request->user()->role, [
                'receptionist', 'medical_staff',
            ], true)) {
            abort(403, 'Access denied.');
        }

        return $staff->load('user');
    }

    public function update(Request $request, StaffProfile $staff)
    {
        $this->authorizeAdmin($request);

        $data = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => [
                'sometimes',
                'required',
                'email',
                Rule::unique('users', 'email')->ignore($staff->user_id),
            ],
            'role' => [
                'sometimes',
                'required',
                Rule::in(['receptionist', 'medical_staff']),
            ],
            'password' => [
                'sometimes',
                'nullable',
                'confirmed',
                Password::min(8),
            ],
            'staff_number' => [
                'sometimes',
                'required',
                'string',
                'max:50',
                Rule::unique('staff_profiles', 'staff_number')->ignore($staff->id),
            ],
            'specialization' => 'sometimes|nullable|string|max:255',
            'availability_status' => 'sometimes|boolean',
        ]);

        if (
            isset($data['role']) &&
            $data['role'] !== $staff->user->role &&
            ($staff->appointments()->exists() || $staff->consultations()->exists())
        ) {
            return response()->json([
                'message' => 'A staff role cannot be changed while the profile has appointment or consultation history.',
            ], 422);
        }

        DB::transaction(function () use ($data, $staff) {
            $staff->update(collect($data)->only([
                'staff_number',
                'specialization',
                'availability_status',
            ])->all());

            $userData = collect($data)->only([
                'name', 'email', 'role',
            ])->all();

            if (!empty($data['password'])) {
                $userData['password'] = Hash::make($data['password']);
            }

            $staff->user->update($userData);
        });

        return response()->json([
            'message' => 'Staff information updated.',
            'staff' => $staff->fresh()->load('user'),
        ]);
    }

    public function destroy(Request $request, StaffProfile $staff)
    {
        $this->authorizeAdmin($request);

        if (
            $staff->appointments()->exists() ||
            $staff->consultations()->exists()
        ) {
            return response()->json([
                'message' => 'Staff with appointment or consultation history cannot be deleted.',
            ], 422);
        }

        DB::transaction(function () use ($staff) {
            $user = $staff->user;
            $staff->delete();

            if ($user) {
                $user->delete();
            }
        });

        return response()->json([
            'message' => 'Staff account deleted.',
        ]);
    }
}
