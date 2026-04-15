# FinPlan — Outil d'Aide à la Décision et de Pilotage Budgétaire

> **Projet académique et professionnel** · Business Computing & Information Systems
> Application web de gestion budgétaire personnelle, conçue selon les principes de l'ingénierie logicielle d'entreprise et orientée vers l'aide à la décision financière.

---

## Table des matières

1. [Description du projet](#1-description-du-projet)
2. [Architecture technique](#2-architecture-technique)
3. [Services web REST — Contrat d'API](#3-services-web-rest--contrat-dapi)
4. [Modèle relationnel et base de données](#4-modèle-relationnel-et-base-de-données)
5. [Business Intelligence et analytique](#5-business-intelligence-et-analytique)
6. [Ingénierie logicielle — Principes appliqués](#6-ingénierie-logicielle--principes-appliqués)
7. [Sécurité applicative](#7-sécurité-applicative)
8. [Fonctionnalités principales](#8-fonctionnalités-principales)
9. [Stack technologique](#9-stack-technologique)
10. [Installation et démarrage](#10-installation-et-démarrage)
11. [Tests et qualité logicielle](#11-tests-et-qualité-logicielle)
12. [Gestion de projet](#12-gestion-de-projet)
13. [Perspectives d'évolution](#13-perspectives-dévolution)

---

## 1. Description du projet

**FinPlan** est un outil de pilotage budgétaire personnel conçu pour répondre aux besoins d'analyse financière, de planification des objectifs d'épargne et d'aide à la décision. Il s'inscrit dans la catégorie des **systèmes d'aide à la décision (SAD)** en fournissant des indicateurs clés de performance (KPI) en temps réel, des recommandations algorithmiques et un moteur de projection de trésorerie.

Le projet illustre une transition d'un script JavaScript procédural vers une **application web d'entreprise multi-couche**, en appliquant les concepts fondamentaux enseignés en **Business Computing et Information Systems** :

- Architecture **MVC (Modèle-Vue-Contrôleur)** via le framework **Laravel (PHP)**
- Services web **RESTful** selon les principes de Roy Fielding
- Persistance des données via un **SGBDR relationnel** (MySQL / PostgreSQL)
- Exportation **ETL** vers des outils de Business Intelligence (Power BI, Tableau)
- Sécurité applicative avec **Laravel Sanctum** (authentification par token API) et contrôle d'accès basé sur les politiques (**Policies**)

---

## 2. Architecture technique

### 2.1 Architecture 3-tiers (Three-Tier Architecture)

L'application est structurée selon le modèle **3-tiers** qui sépare strictement les responsabilités entre trois couches indépendantes :

```
┌─────────────────────────────────────────────────────────────┐
│         COUCHE PRÉSENTATION  (Tier 1 — Client)              │
│                                                             │
│   React 19 SPA  ←──── Axios / Fetch API ────→  Token API   │
│   Composants UI modulaires · Routing · Gestion d'état       │
└──────────────────────────┬──────────────────────────────────┘
                           │  HTTPS · JSON · REST
┌──────────────────────────▼──────────────────────────────────┐
│         COUCHE LOGIQUE APPLICATIVE  (Tier 2 — Serveur)      │
│                                                             │
│   Laravel (PHP)  →  Controller  →  Service  →  Repository  │
│   Laravel Sanctum · Form Requests · API Resources          │
│   Moteur de cashflow · Algorithme d'allocation             │
└──────────────────────────┬──────────────────────────────────┘
                           │  Eloquent ORM / PDO
┌──────────────────────────▼──────────────────────────────────┐
│         COUCHE DONNÉES  (Tier 3 — SGBDR)                    │
│                                                             │
│   MySQL / PostgreSQL  ·  Migrations Laravel (Artisan)       │
│   Schéma relationnel normalisé · Vues analytiques BI        │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Patron MVC dans Laravel

Le patron **MVC** est le cœur de Laravel. Chaque requête HTTP traverse un pipeline précis :

```
Client (React)
     │
     │  HTTP Request
     ▼
routes/api.php           ← Définition des routes REST
     │
     ▼
Middleware               ← auth:sanctum, throttle, CORS
     │
     ▼
Controller               ← Reçoit la requête, délègue au Service
     │
     ▼
Service                  ← Contient la logique métier pure
     │
     ▼
Repository / Model       ← Eloquent ORM — accès à la base de données
     │
     ▼
MySQL / PostgreSQL        ← Persistance relationnelle
     │
     ▼
API Resource             ← Transforme l'entité en réponse JSON propre
     │
     ▼
Client (React)           ← Réponse JSON structurée
```

| Composant | Rôle | Emplacement Laravel |
|-----------|------|---------------------|
| **Modèle** | Entités Eloquent, logique métier, accès données | `app/Models/` |
| **Vue** | Sérialisation JSON via API Resources | `app/Http/Resources/` |
| **Contrôleur** | Routage, validation, délégation au Service | `app/Http/Controllers/` |
| **Service** | Règles métier, orchestration des opérations | `app/Services/` |
| **Repository** | Abstraction de la couche données | `app/Repositories/` |

### 2.3 Organisation des dossiers (Laravel)

```
budget-api/
├── routes/
│   └── api.php                    # Toutes les routes REST
│
├── app/
│   ├── Http/
│   │   ├── Controllers/           # Couche Contrôleur
│   │   │   ├── AuthController.php
│   │   │   ├── GoalController.php
│   │   │   ├── RecurringExpenseController.php
│   │   │   ├── IncomeController.php
│   │   │   ├── ExpenseController.php
│   │   │   └── DashboardController.php
│   │   │
│   │   ├── Requests/              # Validation des entrées (Form Requests)
│   │   │   ├── StoreGoalRequest.php
│   │   │   ├── StoreIncomeRequest.php
│   │   │   └── AllocateIncomeRequest.php
│   │   │
│   │   ├── Resources/             # Transformateurs JSON (DTOs)
│   │   │   ├── GoalResource.php
│   │   │   ├── DashboardResource.php
│   │   │   └── BiExportResource.php
│   │   │
│   │   └── Middleware/
│   │       └── EnsureUserOwnsResource.php
│   │
│   ├── Models/                    # Entités Eloquent (Modèle de domaine)
│   │   ├── User.php
│   │   ├── Goal.php
│   │   ├── RecurringExpense.php
│   │   ├── IncomeEvent.php
│   │   └── MonthlyExpense.php
│   │
│   ├── Services/                  # Logique applicative (Couche Service)
│   │   ├── GoalService.php
│   │   ├── CashflowService.php    # Port du moteur cashflow.js
│   │   ├── AllocationService.php  # Port de l'algorithme allocator.js
│   │   ├── DashboardService.php
│   │   └── BiExportService.php
│   │
│   ├── Repositories/              # Couche DAO (pattern Repository)
│   │   ├── GoalRepository.php
│   │   ├── RecurringExpenseRepository.php
│   │   └── IncomeEventRepository.php
│   │
│   └── Policies/                  # Contrôle d'accès (RBAC)
│       └── GoalPolicy.php
│
├── database/
│   ├── migrations/                # Migrations versionnées (Artisan)
│   │   ├── 2026_01_01_create_users_table.php
│   │   ├── 2026_01_02_create_goals_table.php
│   │   ├── 2026_01_03_create_recurring_expenses_table.php
│   │   ├── 2026_01_04_create_income_events_table.php
│   │   └── 2026_01_05_create_monthly_expenses_table.php
│   └── seeders/                   # Données de test / démonstration
│
└── config/
    ├── sanctum.php                # Configuration authentification
    └── cors.php                   # Configuration CORS
```

### 2.4 Exemple de code — Contrôleur / Service / Repository

```php
// ── ROUTES (routes/api.php) ───────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    Route::apiResource('goals', GoalController::class);
    Route::post('goals/{goal}/fund', [GoalController::class, 'fund']);
    Route::post('income/allocate', [IncomeController::class, 'allocate']);
    Route::get('dashboard/summary', [DashboardController::class, 'summary']);
    Route::get('bi/export', [DashboardController::class, 'export']);
});

// ── CONTRÔLEUR (app/Http/Controllers/GoalController.php) ──
class GoalController extends Controller
{
    public function __construct(private GoalService $goalService) {}

    public function index(Request $request): ResourceCollection
    {
        $goals = $this->goalService->getAllForUser($request->user());
        return GoalResource::collection($goals);
    }

    public function store(StoreGoalRequest $request): GoalResource
    {
        $goal = $this->goalService->create($request->validated(), $request->user());
        return new GoalResource($goal);
    }

    public function update(StoreGoalRequest $request, Goal $goal): GoalResource
    {
        $this->authorize('update', $goal);  // GoalPolicy
        return new GoalResource($this->goalService->update($goal, $request->validated()));
    }

    public function destroy(Goal $goal): Response
    {
        $this->authorize('delete', $goal);
        $this->goalService->delete($goal);
        return response()->noContent();
    }
}

// ── SERVICE (app/Services/GoalService.php) ────────────────
class GoalService
{
    public function __construct(private GoalRepository $goalRepo) {}

    public function getAllForUser(User $user): Collection
    {
        return $this->goalRepo->findByUser($user);
    }

    public function create(array $data, User $user): Goal
    {
        return $this->goalRepo->create(array_merge($data, ['user_id' => $user->id]));
    }

    public function update(Goal $goal, array $data): Goal
    {
        return $this->goalRepo->update($goal, $data);
    }

    public function delete(Goal $goal): void
    {
        $this->goalRepo->delete($goal);
    }
}

// ── REPOSITORY (app/Repositories/GoalRepository.php) ─────
class GoalRepository
{
    public function findByUser(User $user): Collection
    {
        return Goal::where('user_id', $user->id)->get();
    }

    public function create(array $data): Goal
    {
        return Goal::create($data);
    }

    public function update(Goal $goal, array $data): Goal
    {
        $goal->update($data);
        return $goal->fresh();
    }

    public function delete(Goal $goal): void
    {
        $goal->delete();
    }

    // Agrégation pour le BI
    public function aggregateByType(User $user): Collection
    {
        return Goal::where('user_id', $user->id)
            ->selectRaw('type, SUM(saved) as total_saved, SUM(target) as total_target, COUNT(*) as goal_count')
            ->groupBy('type')
            ->get();
    }
}

// ── FORM REQUEST (app/Http/Requests/StoreGoalRequest.php) ─
class StoreGoalRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name'        => ['required', 'string', 'max:255'],
            'target'      => ['required', 'numeric', 'min:0.01'],
            'priority'    => ['required', 'in:High,Medium,Low'],
            'type'        => ['required', 'in:saving,wishlist'],
            'target_date' => ['nullable', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/'],
        ];
    }
}

// ── API RESOURCE (app/Http/Resources/GoalResource.php) ────
class GoalResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'          => $this->id,
            'name'        => $this->name,
            'target'      => $this->target,
            'saved'       => $this->saved,
            'progress'    => $this->target > 0
                                ? round(($this->saved / $this->target) * 100, 1)
                                : 0,
            'priority'    => $this->priority,
            'type'        => $this->type,
            'is_buffer'   => $this->is_buffer,
            'target_date' => $this->target_date,
            'created_at'  => $this->created_at->toISOString(),
        ];
    }
}
```

---

## 3. Services web REST — Contrat d'API

L'API respecte les **contraintes REST** (Representational State Transfer) : architecture client-serveur, absence d'état (stateless), interface uniforme et mise en cache.

Les méthodes HTTP standard sont utilisées pour les opérations **CRUD** :

| Méthode | Endpoint | Description | Statut HTTP |
|---------|----------|-------------|-------------|
| `POST` | `/api/auth/login` | Authentification → retourne token Sanctum | `200 OK` |
| `POST` | `/api/auth/register` | Création de compte | `201 Created` |
| `POST` | `/api/auth/logout` | Révocation du token | `200 OK` |
| `GET` | `/api/goals` | Lister tous les objectifs | `200 OK` |
| `POST` | `/api/goals` | Créer un objectif | `201 Created` |
| `PUT` | `/api/goals/{id}` | Modifier un objectif | `200 OK` |
| `DELETE` | `/api/goals/{id}` | Supprimer un objectif | `204 No Content` |
| `POST` | `/api/goals/{id}/fund` | Alimenter un objectif | `200 OK` |
| `GET` | `/api/recurring-expenses` | Lister les charges fixes | `200 OK` |
| `POST` | `/api/recurring-expenses` | Créer une charge récurrente | `201 Created` |
| `PATCH` | `/api/recurring-expenses/{id}/toggle` | Activer / suspendre | `200 OK` |
| `POST` | `/api/income/allocate` | Allocation intelligente du revenu | `200 OK` |
| `GET` | `/api/dashboard/summary` | Tableau de bord KPI | `200 OK` |
| `GET` | `/api/bi/export?format=csv` | Export ETL (CSV Power BI) | `200 OK` |
| `GET` | `/api/bi/export?format=json` | Export ETL (JSON analytique) | `200 OK` |

**Format de réponse standardisé :**
```json
{
  "data": { "id": "uuid", "name": "Épargne vacances", "saved": 450.00 },
  "message": "Objectif créé avec succès."
}
```

**Gestion des erreurs Laravel (422 Validation) :**
```json
{
  "message": "Les données fournies sont invalides.",
  "errors": {
    "amount": ["Le champ montant doit être supérieur à zéro."],
    "target_date": ["Le format de la date doit être AAAA-MM."]
  }
}
```

---

## 4. Modèle relationnel et base de données

### 4.1 Diagramme Entité-Association (EA)

Le schéma est normalisé jusqu'en **Troisième Forme Normale (3FN)** afin d'éliminer les redondances et de garantir l'intégrité référentielle :

```
USERS ──────────┬──────────── BUDGET_SETTINGS
  │             │
  ├─────────────┤──────────── GOALS ──────── INCOME_ALLOCATIONS
  │             │                                    │
  ├─────────────┤──────────── INCOME_EVENTS ─────────┘
  │             │
  ├─────────────┤──────────── RECURRING_EXPENSES
  │             │
  └─────────────┘──────────── MONTHLY_EXPENSES ─── (fk → RECURRING_EXPENSES)
```

### 4.2 Migrations Laravel (Artisan)

Laravel gère les évolutions du schéma via des **migrations versionnées** exécutées avec `php artisan migrate` :

```php
// database/migrations/2026_01_02_create_goals_table.php
Schema::create('goals', function (Blueprint $table) {
    $table->uuid('id')->primary()->default(DB::raw('(UUID())'));
    $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
    $table->string('name', 255);
    $table->decimal('target', 12, 2);
    $table->decimal('saved', 12, 2)->default(0);
    $table->enum('priority', ['High', 'Medium', 'Low']);
    $table->enum('type', ['saving', 'wishlist']);
    $table->boolean('is_buffer')->default(false);
    $table->string('target_date', 7)->nullable();  // YYYY-MM
    $table->timestamps();
});

// database/migrations/2026_01_03_create_recurring_expenses_table.php
Schema::create('recurring_expenses', function (Blueprint $table) {
    $table->uuid('id')->primary()->default(DB::raw('(UUID())'));
    $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
    $table->string('name', 255);
    $table->decimal('amount', 12, 2);
    $table->enum('period', ['monthly', 'weekly']);
    $table->unsignedTinyInteger('cut_day')->nullable();
    $table->date('last_applied_date')->nullable();
    $table->boolean('active')->default(true);
    $table->timestamps();
});
```

### 4.3 Modèles Eloquent

```php
// app/Models/Goal.php
class Goal extends Model
{
    use HasUuids;

    protected $fillable = [
        'user_id', 'name', 'target', 'saved',
        'priority', 'type', 'is_buffer', 'target_date',
    ];

    protected $casts = [
        'target'    => 'decimal:2',
        'saved'     => 'decimal:2',
        'is_buffer' => 'boolean',
    ];

    // Relations
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function allocations(): HasMany
    {
        return $this->hasMany(IncomeAllocation::class);
    }

    // Accesseur calculé
    public function getProgressAttribute(): float
    {
        return $this->target > 0
            ? round(($this->saved / $this->target) * 100, 1)
            : 0;
    }
}
```

### 4.4 Vue analytique SQL (BI)

```sql
-- Vue pour le tableau de bord et les exports Power BI
CREATE VIEW v_monthly_cashflow AS
SELECT
    me.user_id,
    me.month_key,
    SUM(me.amount)                                          AS total_depenses,
    bs.monthly_budget                                       AS budget_mensuel,
    (bs.monthly_budget - SUM(me.amount))                   AS excedent,
    COUNT(me.id)                                            AS nb_transactions,
    SUM(CASE WHEN me.is_recurring = 1 THEN me.amount ELSE 0 END) AS charges_fixes,
    SUM(CASE WHEN me.is_recurring = 0 THEN me.amount ELSE 0 END) AS charges_variables
FROM monthly_expenses me
JOIN budget_settings bs ON bs.user_id = me.user_id
GROUP BY me.user_id, me.month_key, bs.monthly_budget;
```

---

## 5. Business Intelligence et analytique

### 5.1 Architecture BI — Approche Entrepôt de Données

L'application intègre une couche **ETL (Extract, Transform, Load)** permettant d'alimenter des outils de BI tels que **Power BI**, **Tableau** ou **Excel Power Query** :

```
Application (OLTP)         ETL Layer                  Outils BI (OLAP)
      │                        │                           │
      │   /api/bi/export  ─────┤                           │
      │   (format=csv)         │   Faits agrégés ──────────► Power BI
      │                        │   Dimensions              ► Tableau
      ▼                        │   KPIs mensuels ──────────► Excel
MySQL / PostgreSQL              │                           │
(données transac.)  ───────────► Vues SQL analytiques ─────┘
```

```php
// app/Services/BiExportService.php
class BiExportService
{
    public function buildFactTable(User $user): Collection
    {
        return MonthlyExpense::where('user_id', $user->id)
            ->select('expense_date', 'month_key', 'name', 'amount', 'is_recurring')
            ->get()
            ->map(fn ($e) => [
                'date'      => $e->expense_date,
                'mois'      => $e->month_key,
                'categorie' => $e->is_recurring ? 'Récurrente' : 'Variable',
                'nom'       => $e->name,
                'montant'   => $e->amount,
            ]);
    }

    public function toCsv(User $user): string
    {
        $rows = $this->buildFactTable($user);
        $csv  = "date,mois,categorie,nom,montant\n";

        foreach ($rows as $row) {
            $csv .= implode(',', [
                $row['date'], $row['mois'], $row['categorie'],
                '"' . $row['nom'] . '"', number_format($row['montant'], 2),
            ]) . "\n";
        }

        return $csv;
    }
}
```

### 5.2 Indicateurs clés de performance (KPIs)

Le tableau de bord expose les métriques de pilotage suivantes :

| KPI | Description | Calcul |
|-----|-------------|--------|
| **Taux d'épargne mensuel** | Part du budget non dépensée | `(budget - dépenses) / budget × 100` |
| **Runway financier** | Mois de survie avec le buffer actuel | `buffer_épargne / charges_mensuelles` |
| **Taux de couverture des objectifs** | Progression globale | `Σ(saved) / Σ(target) × 100` |
| **Ratio charges fixes / variables** | Répartition des dépenses | `charges_fixes / total_dépenses × 100` |
| **Projection de liquidation** | Date estimée d'épuisement du buffer | Simulation sur 24 mois |

### 5.3 Format d'export ETL (CSV — compatible Power BI)

```
date,mois,categorie,nom,montant
2026-04-01,2026-04,Récurrente,Loyer,750.00
2026-04-03,2026-04,Variable,Courses,82.50
2026-04-05,2026-04,Récurrente,Abonnement Gym,29.99
```

La connexion Power BI s'effectue via **Obtenir des données → Web** en pointant sur l'endpoint `/api/bi/export?format=csv` avec le header `Authorization: Bearer <token>`.

---

## 6. Ingénierie logicielle — Principes appliqués

### 6.1 Conception orientée objet (COO)

L'application applique les quatre piliers de la **Programmation Orientée Objet** :

- **Encapsulation** : Les modèles Eloquent (`Goal`, `RecurringExpense`) contrôlent l'accès à leurs attributs via `$fillable`, `$hidden` et les accesseurs. La logique de calcul du buffer est encapsulée dans `DashboardService`.
- **Héritage** : Tous les contrôleurs héritent de `Controller` (qui inclut `AuthorizesRequests` et `ValidatesRequests`). Les modèles héritent d'`Illuminate\Database\Eloquent\Model`.
- **Polymorphisme** : L'interface `AllocationStrategyInterface` permet de substituer l'algorithme d'allocation sans modifier les appelants (patron Stratégie).
- **Abstraction** : Les interfaces `RepositoryInterface` cachent les détails d'implémentation Eloquent aux Services.

### 6.2 Modularité

Le système est décomposé en modules fonctionnels indépendants et interchangeables :

```
┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Module Objectifs│  │ Module Trésorerie │  │  Module Revenus  │
│  GoalController  │  │ CashflowService   │  │ AllocationService│
│  GoalService     │  │ (cashflow.js→PHP) │  │ (allocator.js→PHP│
│  GoalRepository  │  └──────────────────┘  └──────────────────┘
└─────────────────┘            │                    │
         │                     └──────────┬──────────┘
         └───────────────────────────────▼
                           ┌────────────────┐
                           │ DashboardService│
                           │  BiExportService│
                           └────────────────┘
```

### 6.3 Faible couplage et forte cohésion

- **Faible couplage** : Les couches communiquent via des interfaces. Le `GoalController` ne connaît pas la base de données — il délègue au `GoalService`, qui délègue au `GoalRepository`.
- **Forte cohésion** : Chaque classe a une responsabilité unique (SRP). `CashflowService` gère exclusivement le moteur de prélèvements récurrents.

### 6.4 Séparation des problèmes (Separation of Concerns)

| Couche | Responsabilité | Ce qu'elle NE fait PAS |
|--------|---------------|------------------------|
| `Controller` | Parsing HTTP, délégation | Aucune logique métier |
| `FormRequest` | Validation et autorisation des entrées | Aucune logique métier |
| `Service` | Règles métier, orchestration | Aucune requête SQL directe |
| `Repository` | Requêtes Eloquent / SQL | Aucune logique applicative |
| `API Resource` | Transformation en JSON | Ne référence pas la base |
| `Policy` | Règles d'autorisation RBAC | Aucune logique métier |

### 6.5 Patrons de conception (Design Patterns)

| Patron | Catégorie | Application dans FinPlan |
|--------|-----------|--------------------------|
| **Repository (DAO)** | Architectural | `GoalRepository` — abstraction de la persistance Eloquent |
| **Factory** | Création | `AllocationServiceFactory` — sélectionne la stratégie selon le type de revenu |
| **Strategy** | Comportemental | `AllocationStrategyInterface` — algorithme d'allocation substituable |
| **Observer** | Comportemental | `CashflowApplied` Event + Listener — notifie le tableau de bord |
| **Decorator** | Structural | Middleware Laravel — chaîne de filtres (auth → throttle → CORS) |
| **DTO (Data Transfer Object)** | Structural | `GoalResource` — sépare le contrat API de l'entité Eloquent |

---

## 7. Sécurité applicative

La sécurité est implémentée via **Laravel Sanctum** pour l'authentification API et les **Policies** pour le contrôle d'accès :

### 7.1 Authentification par token (Laravel Sanctum)

```
Client                        Serveur Laravel
  │                                  │
  │── POST /api/auth/login ──────────►│  Vérification email + Hash::check (bcrypt)
  │                                  │
  │◄── { token: "1|abc123..." } ─────│  Token Sanctum généré et stocké
  │                                  │
  │── GET /api/goals ────────────────►│  Header: Authorization: Bearer 1|abc123...
  │   (+ token Bearer)               │  Middleware auth:sanctum valide le token
  │                                  │
  │◄── [ { id, name, saved... } ] ───│  Données filtrées par user_id
```

```php
// app/Http/Controllers/AuthController.php
class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email'    => ['required', 'email'],
            'password' => ['required'],
        ]);

        if (!Auth::attempt($credentials)) {
            return response()->json(['message' => 'Identifiants invalides.'], 401);
        }

        $token = $request->user()->createToken('api-token')->plainTextToken;

        return response()->json(['token' => $token]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Déconnexion réussie.']);
    }
}
```

### 7.2 Contrôle d'accès via Policies

```php
// app/Policies/GoalPolicy.php
class GoalPolicy
{
    // Un utilisateur ne peut modifier que SES propres objectifs
    public function update(User $user, Goal $goal): bool
    {
        return $user->id === $goal->user_id;
    }

    public function delete(User $user, Goal $goal): bool
    {
        return $user->id === $goal->user_id;
    }
}
```

### 7.3 Mesures de sécurité appliquées

| Mesure | Implémentation Laravel |
|--------|------------------------|
| **Hachage des mots de passe** | `Hash::make()` — bcrypt (coût = 12) |
| **Validation des entrées** | `FormRequest` avec règles strictes |
| **Isolation des données** | Toutes les requêtes filtrées par `user_id` |
| **Protection CSRF** | `config/cors.php` — origines autorisées explicites |
| **Rate Limiting** | Middleware `throttle:60,1` sur toutes les routes API |
| **Sanitisation** | `strip_tags()` + DOMPurify côté client |
| **HTTPS** | Redirection HTTP → HTTPS via `.htaccess` en production |

---

## 8. Fonctionnalités principales

### Moteur de trésorerie (Cashflow Engine)
- Calcul automatique des prélèvements récurrents (mensuel/hebdomadaire)
- Rattrapage idempotent des périodes manquées (application hors ligne)
- Journalisation horodatée de chaque prélèvement dans l'historique mensuel

### Algorithme d'allocation intelligente des revenus
Algorithme déterministe en **8 phases de priorité** (porté de `allocator.js` vers PHP) :
1. Buffer de survie (budget mensuel minimum)
2. Reconstitution complète du buffer de sécurité
3. Objectifs en retard (délai dépassé — remplissage complet)
4. Objectifs échéant ce mois-ci (remplissage complet)
5. Objectifs à délai futur (versement mensuel calculé)
6. Objectifs haute priorité
7. Objectifs priorité moyenne
8. Wishlist (uniquement si buffer plein)

### Tableau de bord décisionnel
- Statut du runway financier (✅ > 12 mois / ⚠️ 1–3 mois / 🚨 < 1 mois)
- Projection de liquidation du buffer sur 24 mois
- Recommandations algorithmiques personnalisées
- KPIs mensuels : taux d'épargne, répartition des dépenses, progression des objectifs

---

## 9. Stack technologique

### Frontend (Couche Présentation)

| Technologie | Version | Rôle |
|-------------|---------|------|
| React | 19.2 | Framework UI, gestion d'état via hooks |
| Vite | 8.0 | Bundler, HMR, build optimisé |
| Zod | 4.3 | Validation des schémas de données côté client |
| DOMPurify | 3.3 | Sanitisation des entrées utilisateur |

### Backend (Couche Logique — Laravel / PHP)

| Technologie | Version | Rôle |
|-------------|---------|------|
| PHP | 8.3 | Langage backend |
| Laravel | 11 | Framework MVC full-stack |
| Laravel Sanctum | 4.0 | Authentification API par token |
| Eloquent ORM | 11 | Mapping objet-relationnel, requêtes fluentes |
| Laravel Artisan | 11 | Migrations, seeders, commandes CLI |
| Composer | 2.7 | Gestionnaire de dépendances PHP |

### Base de données (Couche Données)

| Technologie | Rôle |
|-------------|------|
| MySQL 8 / PostgreSQL 16 | SGBDR relationnel principal (production) |
| SQLite | Base de données en mémoire (tests) |

### Tests et qualité

| Technologie | Rôle |
|-------------|------|
| Vitest 4.1 | Tests unitaires et d'intégration frontend (126 tests) |
| React Testing Library | Tests de composants UI |
| fast-check | Tests basés sur les propriétés (idempotence) |
| PHPUnit / Pest | Tests unitaires et d'intégration backend |
| Laravel HTTP Tests | Tests des endpoints REST (without/acting as) |

---

## 10. Installation et démarrage

### Prérequis
- Node.js ≥ 18
- PHP ≥ 8.3
- Composer ≥ 2.7
- MySQL 8 ou PostgreSQL 16

### Démarrage frontend (développement)

```bash
# Installer les dépendances JavaScript
npm install

# Lancer le serveur de développement (http://localhost:5173)
npm run dev

# Exécuter la suite de tests (126 tests)
npm test

# Build de production
npm run build
```

### Démarrage backend (Laravel)

```bash
# Cloner et installer les dépendances PHP
cd budget-api
composer install

# Configurer l'environnement
cp .env.example .env
php artisan key:generate

# Configurer la base de données dans .env
# DB_CONNECTION=mysql
# DB_HOST=127.0.0.1
# DB_DATABASE=finplan
# DB_USERNAME=finplan_user
# DB_PASSWORD=votre_mot_de_passe

# Exécuter les migrations et les seeders
php artisan migrate --seed

# Lancer le serveur de développement (http://localhost:8000)
php artisan serve

# Lancer les tests backend
php artisan test
```

### Variables d'environnement (`.env`)

```dotenv
APP_NAME=FinPlan
APP_ENV=production
APP_KEY=base64:...
APP_URL=https://votre-domaine.com

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=finplan
DB_USERNAME=finplan_user
DB_PASSWORD=votre_mot_de_passe_securise

SANCTUM_STATEFUL_DOMAINS=localhost:5173,votre-domaine.com

CORS_ALLOWED_ORIGINS=http://localhost:5173
```

---

## 11. Tests et qualité logicielle

La qualité est assurée par une suite de tests complète couvrant les scénarios nominaux, les cas limites et les scénarios de défaillance :

```
Tests Frontend (126 — taux de réussite : 100%)
│
├── Tests unitaires
│   ├── cashflow.test.js         — Moteur de prélèvements récurrents
│   ├── allocator.test.js        — Algorithme d'allocation en 8 phases
│   ├── storeUtils.test.js       — Calculs buffer et épargne mensuelle
│   ├── financeAI.test.js        — Moteur de recommandations
│   └── math.test.js             — Arithmétique financière et arrondis
│
├── Tests d'intégration
│   ├── store.comprehensive.test.jsx  — Cycle complet store + migrations
│   └── store.regression.test.jsx     — Non-régression des bugs corrigés
│
└── Tests de robustesse (stress / edge cases)
    ├── migrations.test.js             — 6 migrations (v1 → v6)
    ├── idempotency.property.test.js   — Tests basés propriétés (fast-check)
    ├── clockSkew.test.js              — Décalages horaires, années bissextiles
    ├── bootTimeRace.test.jsx          — Conditions de course au démarrage
    ├── catastrophic.test.js           — Récupération sur données corrompues
    ├── rapidChurn.test.jsx            — Mises à jour à haute fréquence
    ├── timeTravel.test.jsx            — Manipulation de dates
    └── quota.test.jsx                 — Gestion des limites de stockage

Tests Backend Laravel (PHPUnit / Pest)
│
├── Unit/
│   ├── CashflowServiceTest.php    — Moteur de cashflow en PHP
│   ├── AllocationServiceTest.php  — Algorithme d'allocation
│   └── BiExportServiceTest.php    — Génération CSV/JSON
│
└── Feature/
    ├── AuthTest.php               — Login, logout, token
    ├── GoalTest.php               — CRUD objectifs, autorisation
    ├── RecurringExpenseTest.php   — Charges récurrentes
    ├── IncomeAllocationTest.php   — Allocation intelligente
    └── DashboardTest.php          — KPIs et export BI
```

**Exécution des tests :**
```bash
# Frontend
npm test                    # Tous les tests
npm run test:coverage       # Rapport de couverture

# Backend
php artisan test            # Tous les tests
php artisan test --coverage # Rapport de couverture
php artisan test --filter GoalTest  # Un seul groupe
```

---

## 12. Gestion de projet

### Approche Agile / Itérative

Le développement de FinPlan a suivi une **méthodologie Agile itérative** organisée en sprints courts (1–2 semaines), avec des livraisons incrémentales et une validation continue :

| Sprint | Périmètre livré |
|--------|-----------------|
| **Sprint 1** | Architecture de base, schéma Zod, store Redux-like |
| **Sprint 2** | Moteur de cashflow, gestion des objectifs |
| **Sprint 3** | Algorithme d'allocation intelligente des revenus |
| **Sprint 4** | Tableau de bord, recommandations algorithmiques |
| **Sprint 5** | Suite de tests complète (126 tests), migrations versionnées |
| **Sprint 6** *(cible)* | Backend Laravel, API REST, base de données MySQL |
| **Sprint 7** *(cible)* | Export BI/ETL, intégration Power BI |

### Outils de planification
- **Diagramme de Gantt** : Planification temporelle des sprints et des jalons
- **Gestion des tickets** : Suivi des fonctionnalités, bugs et améliorations
- **Contrôle de version** : Git avec convention de commits sémantiques (`feat:`, `fix:`, `test:`, `refactor:`)
- **Intégration continue (CI)** : Pipeline GitHub Actions — tests frontend + backend à chaque push

### Convention de commits (Semantic Versioning)
```
feat: add smart income allocation engine
fix: robust catch-up for missed recurring expenses
test: add idempotency property tests with fast-check
refactor: extract cashflow engine to standalone utility
docs: add full French README with enterprise architecture
```

---

## 13. Perspectives d'évolution

| Axe | Description | Priorité |
|-----|-------------|----------|
| **Multi-utilisateurs** | Rôles Admin / User via Gates et Policies Laravel | Haute |
| **Application mobile** | API REST consommée par React Native | Haute |
| **Notifications** | Alertes email (Laravel Notifications + Mailgun) avant échéance | Moyenne |
| **IA prédictive** | Modèle ML (Python) pour prédire les dépenses futures | Moyenne |
| **Synchronisation temps réel** | Laravel Broadcasting + Pusher (WebSockets) | Basse |
| **Rapport PDF** | Export mensuel du tableau de bord (Laravel DomPDF) | Basse |

---

## Licence

Ce projet est développé dans un cadre académique (Business Computing & Information Systems). Tous droits réservés.

---

*Développé avec rigueur selon les principes de l'ingénierie logicielle d'entreprise — Architecture MVC Laravel, Services REST, Modèle Relationnel et Business Intelligence.*
