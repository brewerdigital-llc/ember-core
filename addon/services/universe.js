import Service from '@ember/service';
import Evented from '@ember/object/evented';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { computed, action } from '@ember/object';
import { isBlank } from '@ember/utils';
import { A, isArray } from '@ember/array';
import { later } from '@ember/runloop';
import { dasherize, camelize } from '@ember/string';
import { getOwner } from '@ember/application';
import { assert, debug } from '@ember/debug';
import RSVP from 'rsvp';
import loadInstalledExtensions from '../utils/load-installed-extensions';
import loadExtensions from '../utils/load-extensions';
import getWithDefault from '../utils/get-with-default';
import config from 'ember-get-config';

export default class UniverseService extends Service.extend(Evented) {
    @service router;
    @service intl;
    @tracked headerMenuItems = A([]);
    @tracked organizationMenuItems = A([]);
    @tracked userMenuItems = A([]);
    @tracked adminRegistry = {
        menuItems: A([]),
        menuPanels: A([]),
    };
    @tracked accountRegistry = {
        menuItems: A([]),
        menuPanels: A([]),
    };
    @tracked settingsRegistry = {
        menuItems: A([]),
        menuPanels: A([]),
    };
    @tracked dashboardWidgets = {
        defaultWidgets: A([]),
        widgets: A([]),
    };

    /**
     * Computed property that returns all administrative menu items.
     *
     * @computed adminMenuItems
     * @public
     * @readonly
     * @memberof UniverseService
     * @returns {Array} Array of administrative menu items
     */
    @computed('adminRegistry.menuItems.[]') get adminMenuItems() {
        return this.adminRegistry.menuItems;
    }

    /**
     * Computed property that returns all administrative menu panels.
     *
     * @computed adminMenuPanels
     * @public
     * @readonly
     * @memberof UniverseService
     * @returns {Array} Array of administrative menu panels
     */
    @computed('adminRegistry.menuPanels.[]') get adminMenuPanels() {
        return this.adminRegistry.menuPanels;
    }

    /**
     * Computed property that returns all settings menu items.
     *
     * @computed settingsMenuItems
     * @public
     * @readonly
     * @memberof UniverseService
     * @returns {Array} Array of administrative menu items
     */
    @computed('settingsRegistry.menuItems.[]') get settingsMenuItems() {
        return this.settingsRegistry.menuItems;
    }

    /**
     * Computed property that returns all settings menu panels.
     *
     * @computed settingsMenuPanels
     * @public
     * @readonly
     * @memberof UniverseService
     * @returns {Array} Array of administrative menu panels
     */
    @computed('settingsRegistry.menuPanels.[]') get settingsMenuPanels() {
        return this.settingsRegistry.menuPanels;
    }

    /**
     * Transitions to a given route within a specified Ember engine.
     *
     * This action dynamically retrieves the specified engine's instance and its configuration to prepend the
     * engine's route prefix to the provided route. If the engine instance or its route prefix is not found,
     * it falls back to transitioning to the route without the prefix.
     *
     * @param {string} engineName - The name of the Ember engine.
     * @param {string} route - The route to transition to within the engine.
     * @param {...any} args - Additional arguments to pass to the router's transitionTo method.
     * @returns {Promise} A Promise that resolves with the result of the router's transitionTo method.
     *
     * @example
     * // Transitions to the 'management.fleets.index.new' route within the '@fleetbase/fleet-ops' engine.
     * this.transitionToEngineRoute('@fleetbase/fleet-ops', 'management.fleets.index.new');
     */
    @action transitionToEngineRoute(engineName, route, ...args) {
        const engineInstance = this.getEngineInstance(engineName);

        if (engineInstance) {
            const config = engineInstance.resolveRegistration('config:environment');

            if (config) {
                let mountedEngineRoutePrefix = config.mountedEngineRoutePrefix;

                if (!mountedEngineRoutePrefix) {
                    mountedEngineRoutePrefix = this._mountPathFromEngineName(engineName);
                }

                if (!mountedEngineRoutePrefix.endsWith('.')) {
                    mountedEngineRoutePrefix = mountedEngineRoutePrefix + '.';
                }

                return this.router.transitionTo(`${mountedEngineRoutePrefix}${route}`, ...args);
            }
        }

        return this.router.transitionTo(route, ...args);
    }

    /**
     * Retrieves the mount point of a specified engine by its name.
    
     * @param {string} engineName - The name of the engine for which to get the mount point.
     * @returns {string|null} The mount point of the engine or null if not found.
     */
    getEngineMountPoint(engineName) {
        const engineInstance = this.getEngineInstance(engineName);
        return this._getMountPointFromEngineInstance(engineInstance);
    }

    /**
     * Determines the mount point from an engine instance by reading its configuration.

     * @param {object} engineInstance - The instance of the engine.
     * @returns {string|null} The resolved mount point or null if the instance is undefined or the configuration is not set.
     * @private
     */
    _getMountPointFromEngineInstance(engineInstance) {
        if (engineInstance) {
            const config = engineInstance.resolveRegistration('config:environment');

            if (config) {
                let engineName = config.modulePrefix;
                let mountedEngineRoutePrefix = config.mountedEngineRoutePrefix;

                if (!mountedEngineRoutePrefix) {
                    mountedEngineRoutePrefix = this._mountPathFromEngineName(engineName);
                }

                if (!mountedEngineRoutePrefix.endsWith('.')) {
                    mountedEngineRoutePrefix = mountedEngineRoutePrefix + '.';
                }

                return mountedEngineRoutePrefix;
            }
        }

        return null;
    }

    /**
     * Extracts and formats the mount path from a given engine name.
     *
     * This function takes an engine name in the format '@scope/engine-name',
     * extracts the 'engine-name' part, removes the '-engine' suffix if present,
     * and formats it into a string that represents a console path.
     *
     * @param {string} engineName - The full name of the engine, typically in the format '@scope/engine-name'.
     * @returns {string} A string representing the console path derived from the engine name.
     * @example
     * // returns 'console.some'
     * _mountPathFromEngineName('@fleetbase/some-engine');
     */
    _mountPathFromEngineName(engineName) {
        let engineNameSegments = engineName.split('/');
        let mountName = engineNameSegments[1];

        if (typeof mountName !== 'string') {
            mountName = engineNameSegments[0];
        }

        const mountPath = mountName.replace('-engine', '');
        return `console.${mountPath}`;
    }

    /**
     * Refreshes the current route.
     *
     * This action is a simple wrapper around the router's refresh method. It can be used to re-run the
     * model hooks and reset the controller properties on the current route, effectively reloading the route.
     * This is particularly useful in scenarios where the route needs to be reloaded due to changes in
     * state or data.
     *
     * @returns {Promise} A Promise that resolves with the result of the router's refresh method.
     *
     * @example
     * // To refresh the current route
     * this.refreshRoute();
     */
    @action refreshRoute() {
        return this.router.refresh();
    }

    /**
     * Action to transition to a specified route based on the provided menu item.
     *
     * The route transition will include the 'slug' as a dynamic segment, and
     * the 'view' as an optional dynamic segment if it is defined.
     *
     * @action
     * @memberof UniverseService
     * @param {string} route - The target route to transition to.
     * @param {Object} menuItem - The menu item containing the transition parameters.
     * @param {string} menuItem.slug - The 'slug' dynamic segment for the route.
     * @param {string} [menuItem.view] - The 'view' dynamic segment for the route, if applicable.
     *
     * @returns {Transition} Returns a Transition object representing the transition to the route.
     */
    @action transitionMenuItem(route, menuItem) {
        const { slug, view } = menuItem;

        if (view) {
            return this.router.transitionTo(route, slug, view);
        }

        return this.router.transitionTo(route, slug, 'index');
    }

    /**
     * @action
     * Creates a new registry with the given name and options.
    
     * @memberof UniverseService
     * @param {string} registryName - The name of the registry to create.
     * @param {Object} [options={}] - Optional settings for the registry.
     * @param {Array} [options.menuItems=[]] - An array of menu items for the registry.
     * @param {Array} [options.menuPanel=[]] - An array of menu panels for the registry.
     *
     * @fires registry.created - Event triggered when a new registry is created.
     *
     * @returns {UniverseService} Returns the current UniverseService for chaining.
     *
     * @example
     * createRegistry('myRegistry', { menuItems: ['item1', 'item2'], menuPanel: ['panel1', 'panel2'] });
     */
    @action createRegistry(registryName, options = {}) {
        const internalRegistryName = this.createInternalRegistryName(registryName);

        this[internalRegistryName] = {
            name: registryName,
            menuItems: [],
            menuPanels: [],
            renderableComponents: [],
            ...options,
        };

        // trigger registry created event
        this.trigger('registry.created', this[internalRegistryName]);

        return this;
    }

    /**
     * Creates multiple registries from a given array of registries. Each registry can be either a string or an array.
     * If a registry is an array, it expects two elements: the registry name (string) and registry options (object).
     * If a registry is a string, only the registry name is needed.
     *
     * The function iterates over each element in the `registries` array and creates a registry using the `createRegistry` method.
     * It supports two types of registry definitions:
     * 1. Array format: [registryName, registryOptions] - where registryOptions is an optional object.
     * 2. String format: "registryName" - in this case, only the name is provided and the registry is created with default options.
     *
     * @param {Array} registries - An array of registries to be created. Each element can be either a string or an array.
     * @action
     * @memberof YourComponentOrClassName
     */
    @action createRegistries(registries = []) {
        if (!isArray(registries)) {
            throw new Error('`createRegistries()` method must take an array.');
        }

        for (let i = 0; i < registries.length; i++) {
            const registry = registries[i];

            if (isArray(registry) && registry.length === 2) {
                let registryName = registry[0];
                let registryOptions = registry[1] ?? {};

                this.createRegistry(registryName, registryOptions);
                continue;
            }

            if (typeof registry === 'string') {
                this.createRegistry(registry);
            }
        }
    }

    /**
     * Triggers an event on for a universe registry.
     *
     * @memberof UniverseService
     * @method createRegistryEvent
     * @param {string} registryName - The name of the registry to trigger the event on.
     * @param {string} event - The name of the event to trigger.
     * @param {...*} params - Additional parameters to pass to the event handler.
     */
    @action createRegistryEvent(registryName, event, ...params) {
        this.trigger(`${registryName}.${event}`, ...params);
    }

    /**
     * @action
     * Retrieves the entire registry with the given name.
     *
     * @memberof UniverseService
     * @param {string} registryName - The name of the registry to retrieve.
     *
     * @returns {Object|null} Returns the registry object if it exists; otherwise, returns null.
     *
     * @example
     * const myRegistry = getRegistry('myRegistry');
     */
    @action getRegistry(registryName) {
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const registry = this[internalRegistryName];

        if (!isBlank(registry)) {
            return registry;
        }

        return null;
    }

    /**
     * Looks up a registry by its name and returns it as a Promise.
     *
     * @memberof UniverseService
     * @param {string} registryName - The name of the registry to look up.
     *
     * @returns {Promise<Object|null>} A Promise that resolves to the registry object if it exists; otherwise, rejects with null.
     *
     * @example
     * lookupRegistry('myRegistry')
     *   .then((registry) => {
     *     // Do something with the registry
     *   })
     *   .catch((error) => {
     *     // Handle the error or absence of the registry
     *   });
     */
    lookupRegistry(registryName) {
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const registry = this[internalRegistryName];

        return new Promise((resolve, reject) => {
            if (!isBlank(registry)) {
                return resolve(registry);
            }

            later(
                this,
                () => {
                    if (!isBlank(registry)) {
                        return resolve(registry);
                    }
                },
                100
            );

            reject(null);
        });
    }

    /**
     * @action
     * Retrieves the menu items from a registry with the given name.
     *
     * @memberof UniverseService
     * @param {string} registryName - The name of the registry to retrieve menu items from.
     *
     * @returns {Array} Returns an array of menu items if the registry exists and has menu items; otherwise, returns an empty array.
     *
     * @example
     * const items = getMenuItemsFromRegistry('myRegistry');
     */
    @action getMenuItemsFromRegistry(registryName) {
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const registry = this[internalRegistryName];

        if (!isBlank(registry) && isArray(registry.menuItems)) {
            return registry.menuItems;
        }

        return [];
    }

    /**
     * @action
     * Retrieves the menu panels from a registry with the given name.
     *
     * @memberof UniverseService
     * @param {string} registryName - The name of the registry to retrieve menu panels from.
     *
     * @returns {Array} Returns an array of menu panels if the registry exists and has menu panels; otherwise, returns an empty array.
     *
     * @example
     * const panels = getMenuPanelsFromRegistry('myRegistry');
     */
    @action getMenuPanelsFromRegistry(registryName) {
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const registry = this[internalRegistryName];

        if (!isBlank(registry) && isArray(registry.menuPanels)) {
            return registry.menuPanels;
        }

        return [];
    }

    /**
     * Retrieves renderable components from a specified registry.
     * This action checks the internal registry, identified by the given registry name,
     * and returns the 'renderableComponents' if they are present and are an array.
     *
     * @action
     * @param {string} registryName - The name of the registry to retrieve components from.
     * @returns {Array} An array of renderable components from the specified registry, or an empty array if none found.
     */
    @action getRenderableComponentsFromRegistry(registryName) {
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const registry = this[internalRegistryName];

        if (!isBlank(registry) && isArray(registry.renderableComponents)) {
            return registry.renderableComponents;
        }

        return [];
    }

    /**
     * Loads a component from the specified registry based on a given slug and view.
     *
     * @param {string} registryName - The name of the registry where the component is located.
     * @param {string} slug - The slug of the menu item.
     * @param {string} [view=null] - The view of the menu item, if applicable.
     *
     * @returns {Promise} Returns a Promise that resolves with the component if it is found, or null.
     */
    loadComponentFromRegistry(registryName, slug, view = null) {
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const registry = this[internalRegistryName];

        return new Promise((resolve) => {
            let component = null;

            if (isBlank(registry)) {
                return resolve(component);
            }

            // check menu items first
            for (let i = 0; i < registry.menuItems.length; i++) {
                const menuItem = registry.menuItems[i];

                // no view hack
                if (menuItem && menuItem.slug === slug && menuItem.view === null && view === 'index') {
                    component = menuItem.component;
                    break;
                }

                if (menuItem && menuItem.slug === slug && menuItem.view === view) {
                    component = menuItem.component;
                    break;
                }
            }

            // check menu panels
            for (let i = 0; i < registry.menuPanels.length; i++) {
                const menuPanel = registry.menuPanels[i];

                if (menuPanel && isArray(menuPanel.items)) {
                    for (let j = 0; j < menuPanel.items.length; j++) {
                        const menuItem = menuPanel.items[j];

                        // no view hack
                        if (menuItem && menuItem.slug === slug && menuItem.view === null && view === 'index') {
                            component = menuItem.component;
                            break;
                        }

                        if (menuItem && menuItem.slug === slug && menuItem.view === view) {
                            component = menuItem.component;
                            break;
                        }
                    }
                }
            }

            resolve(component);
        });
    }

    /**
     * Looks up a menu item from the specified registry based on a given slug and view.
     *
     * @param {string} registryName - The name of the registry where the menu item is located.
     * @param {string} slug - The slug of the menu item.
     * @param {string} [view=null] - The view of the menu item, if applicable.
     *
     * @returns {Promise} Returns a Promise that resolves with the menu item if it is found, or null.
     */
    lookupMenuItemFromRegistry(registryName, slug, view = null) {
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const registry = this[internalRegistryName];

        return new Promise((resolve) => {
            let foundMenuItem = null;

            if (isBlank(registry)) {
                return resolve(foundMenuItem);
            }

            // check menu items first
            for (let i = 0; i < registry.menuItems.length; i++) {
                const menuItem = registry.menuItems[i];

                // no view hack
                if (menuItem && menuItem.slug === slug && menuItem.view === null && view === 'index') {
                    foundMenuItem = menuItem;
                    break;
                }

                if (menuItem && menuItem.slug === slug && menuItem.view === view) {
                    foundMenuItem = menuItem;
                    break;
                }
            }

            // check menu panels
            for (let i = 0; i < registry.menuPanels.length; i++) {
                const menuPanel = registry.menuPanels[i];

                if (menuPanel && isArray(menuPanel.items)) {
                    for (let j = 0; j < menuPanel.items.length; j++) {
                        const menuItem = menuPanel.items[j];

                        // no view hack
                        if (menuItem && menuItem.slug === slug && menuItem.view === null && view === 'index') {
                            foundMenuItem = menuItem;
                            break;
                        }

                        if (menuItem && menuItem.slug === slug && menuItem.view === view) {
                            foundMenuItem = menuItem;
                            break;
                        }
                    }
                }
            }

            resolve(foundMenuItem);
        });
    }

    /**
     * Registers a renderable component or an array of components into a specified registry.
     * If a single component is provided, it is registered directly.
     * If an array of components is provided, each component in the array is registered individually.
     * The component is also registered into the specified engine.
     *
     * @param {string} engineName - The name of the engine to register the component(s) into.
     * @param {string} registryName - The registry name where the component(s) should be registered.
     * @param {Object|Array} component - The component or array of components to register.
     */
    registerRenderableComponent(engineName, registryName, component) {
        if (isArray(component)) {
            component.forEach((_) => this.registerRenderableComponent(registryName, _));
            return;
        }

        // register component to engine
        this.registerComponentInEngine(engineName, component);

        // register to registry
        const internalRegistryName = this.createInternalRegistryName(registryName);
        if (!isBlank(this[internalRegistryName])) {
            if (isArray(this[internalRegistryName].renderableComponents)) {
                this[internalRegistryName].renderableComponents.pushObject(component);
            } else {
                this[internalRegistryName].renderableComponents = [component];
            }
        } else {
            this.createRegistry(registryName);
            return this.registerRenderableComponent(...arguments);
        }
    }

    /**
     * Registers a new menu panel in a registry.
     *
     * @method registerMenuPanel
     * @public
     * @memberof UniverseService
     * @param {String} registryName The name of the registry to use
     * @param {String} title The title of the panel
     * @param {Array} items The items of the panel
     * @param {Object} options Additional options for the panel
     */
    registerMenuPanel(registryName, title, items = [], options = {}) {
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const open = this._getOption(options, 'open', true);
        const slug = this._getOption(options, 'slug', dasherize(title));
        const menuPanel = {
            title,
            open,
            items: items.map(({ title, route, ...options }) => {
                options.slug = slug;
                options.view = dasherize(title);

                return this._createMenuItem(title, route, options);
            }),
        };

        // register menu panel
        this[internalRegistryName].menuPanels.pushObject(menuPanel);

        // trigger menu panel registered event
        this.trigger('menuPanel.registered', menuPanel, this[internalRegistryName]);
    }

    /**
     * Registers a new menu item in a registry.
     *
     * @method registerMenuItem
     * @public
     * @memberof UniverseService
     * @param {String} registryName The name of the registry to use
     * @param {String} title The title of the item
     * @param {String} route The route of the item
     * @param {Object} options Additional options for the item
     */
    registerMenuItem(registryName, title, options = {}) {
        const internalRegistryName = this.createInternalRegistryName(registryName);
        const route = this._getOption(options, 'route', `console.${dasherize(registryName)}.virtual`);
        options.slug = this._getOption(options, 'slug', '~');
        options.view = this._getOption(options, 'view', dasherize(title));

        // not really a fan of assumptions, but will do this for the timebeing till anyone complains
        if (options.slug === options.view) {
            options.view = null;
        }

        // register component if applicable
        this.registerMenuItemComponentToEngine(options);

        // create menu item
        const menuItem = this._createMenuItem(title, route, options);

        // register menu item
        if (!this[internalRegistryName]) {
            this[internalRegistryName] = {
                menuItems: [],
                menuPanels: [],
            };
        }

        // register menu item
        this[internalRegistryName].menuItems.pushObject(menuItem);

        // trigger menu panel registered event
        this.trigger('menuItem.registered', menuItem, this[internalRegistryName]);
    }

    /**
     * Registers a menu item's component to one or multiple engines.
     *
     * @method registerMenuItemComponentToEngine
     * @public
     * @memberof UniverseService
     * @param {Object} options - An object containing the following properties:
     *   - `registerComponentToEngine`: A string or an array of strings representing the engine names where the component should be registered.
     *   - `component`: The component class to register, which should have a 'name' property.
     */
    registerMenuItemComponentToEngine(options) {
        // Register component if applicable
        if (typeof options.registerComponentToEngine === 'string') {
            this.registerComponentInEngine(options.registerComponentToEngine, options.component);
        }

        // register to multiple engines
        if (isArray(options.registerComponentToEngine)) {
            for (let i = 0; i < options.registerComponentInEngine.length; i++) {
                const engineName = options.registerComponentInEngine.objectAt(i);

                if (typeof engineName === 'string') {
                    this.registerComponentInEngine(engineName, options.component);
                }
            }
        }
    }

    /**
     * Registers a new administrative menu panel.
     *
     * @method registerAdminMenuPanel
     * @public
     * @memberof UniverseService
     * @param {String} title The title of the panel
     * @param {Array} items The items of the panel
     * @param {Object} options Additional options for the panel
     */
    registerAdminMenuPanel(title, items = [], options = {}) {
        options.section = this._getOption(options, 'section', 'admin');
        this.registerMenuPanel('admin', title, items, options);
    }

    /**
     * Registers a new administrative menu item.
     *
     * @method registerAdminMenuItem
     * @public
     * @memberof UniverseService
     * @param {String} title The title of the item
     * @param {Object} options Additional options for the item
     */
    registerAdminMenuItem(title, options = {}) {
        this.registerMenuItem('admin', title, options);
    }

    /**
     * Registers a new settings menu panel.
     *
     * @method registerSettingsMenuPanel
     * @public
     * @memberof UniverseService
     * @param {String} title The title of the panel
     * @param {Array} items The items of the panel
     * @param {Object} options Additional options for the panel
     */
    registerSettingsMenuPanel(title, items = [], options = {}) {
        this.registerMenuPanel('settings', title, items, options);
    }

    /**
     * Registers a new dashboard widget in the universe service.
     *
     * @method registerDashboardWidgets
     * @public
     * @memberof UniverseService
     * @param {Object} widget - The widget object containing name, component, gridOptions, and options.
     *   @property {String} name - The name of the widget.
     *   @property {String} icon - The iron of the widget.
     *   @property {Function} component - The component associated with the widget.
     *   @property {Object} gridOptions - The grid options for the widget.
     *   @property {Object} options - Additional options for the widget.
     */
    registerDashboardWidgets(widget) {
        if (isArray(widget)) {
            widget.forEach((w) => this.registerDashboardWidgets(w));
            return;
        }

        const newWidget = this._createDashboardWidget(widget);
        this.dashboardWidgets.widgets.pushObject(newWidget);
        this.trigger('widget.registered', newWidget);
    }

    /**
     * Retrieves the widgets registered in the universe service.
     *
     * @method getDashboardWidgets
     * @public
     * @memberof UniverseService
     * @returns {Array} An array of registered widgets
     */
    getDashboardWidgets() {
        return this.dashboardWidgets.widgets;
    }

    /**
     * Registers a new dashboard widget in the universe service.
     *
     * @method registerDefaultDashboardWidgets
     * @public
     * @memberof UniverseService
     * @param {Object} widget - The widget object containing name, component, gridOptions, and options.
     *   @property {String} name - The name of the widget.
     *   @property {String} icon - The iron of the widget.
     *   @property {Function} component - The component associated with the widget.
     *   @property {Object} gridOptions - The grid options for the widget.
     *   @property {Object} options - Additional options for the widget.
     */
    registerDefaultDashboardWidgets(widget) {
        if (isArray(widget)) {
            widget.forEach((w) => this.registerDefaultDashboardWidgets(w));
            return;
        }

        const newWidget = this._createDashboardWidget(widget);
        this.dashboardWidgets.defaultWidgets.pushObject(newWidget);
        this.trigger('widget.registered', newWidget);
    }

    /**
     * Retrieves the widgets registered in the universe service.
     *
     * @method getDefaultDashboardWidgets
     * @public
     * @memberof UniverseService
     * @returns {Array} An array of registered widgets
     */
    getDefaultDashboardWidgets() {
        return this.dashboardWidgets.defaultWidgets;
    }

    /**
     * Creates a dashboard widget object from the given widget configuration.
     *
     * @param {Object} widget - The widget configuration object.
     * @param {string} widget.widgetId - The unique identifier for the widget.
     * @param {string} widget.name - The name of the widget.
     * @param {string} widget.description - The description of the widget.
     * @param {string} widget.icon - The icon for the widget.
     * @param {(Function|string)} widget.component - The component class or name for the widget.
     * @param {Object} widget.grid_options - Grid options for the widget layout.
     * @param {Object} widget.options - Additional options for the widget.
     * @returns {Object} A new widget object with properties derived from the input configuration.
     * @memberof UniverseService
     */
    _createDashboardWidget(widget) {
        // Extract properties from the widget object
        let { widgetId, name, description, icon, component, grid_options, options } = widget;

        // If component is a definition register to host application
        if (typeof component === 'function') {
            const owner = getOwner(this);
            widgetId = component.widgetId || widgetId || this._createUniqueWidgetHashFromDefinition(component);

            if (owner) {
                owner.register(`component:${widgetId}`, component);

                // Update component name
                component = widgetId;
            }
        }

        // Create a new widget object with the extracted properties
        const newWidget = {
            widgetId,
            name,
            description,
            icon,
            component,
            grid_options,
            options,
        };

        return newWidget;
    }

    /**
     * Creates a unique hash from a component's definition. This hash is used as an identifier
     * for the component when a direct identifier (widgetId) or a name is not available.
     *
     * @param {Function} component - The component class or constructor function.
     * @returns {string} A unique hash string representing the component's definition.
     * @memberof UniverseService
     */
    _createUniqueWidgetHashFromDefinition(component) {
        if (typeof component.toString === 'function') {
            let definition = component.toString();
            let hash = 0;
            for (let i = 0; i < definition.length; i++) {
                const char = definition.charCodeAt(i);
                hash = (hash << 5) - hash + char;
                hash |= 0;
            }
            return hash.toString(16);
        }

        return component.name;
    }

    /**
     * Registers a new settings menu item.
     *
     * @method registerSettingsMenuItem
     * @public
     * @memberof UniverseService
     * @param {String} title The title of the item
     * @param {Object} options Additional options for the item
     */
    registerSettingsMenuItem(title, options = {}) {
        this.registerMenuItem('settings', title, options);
    }

    /**
     * Registers a new header menu item.
     *
     * @method registerHeaderMenuItem
     * @public
     * @memberof UniverseService
     * @param {String} title The title of the item
     * @param {String} route The route of the item
     * @param {Object} options Additional options for the item
     */
    registerHeaderMenuItem(title, route, options = {}) {
        this.headerMenuItems.pushObject(this._createMenuItem(title, route, options));
        this.headerMenuItems.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Registers a new organization menu item.
     *
     * @method registerOrganizationMenuItem
     * @public
     * @memberof UniverseService
     * @param {String} title The title of the item
     * @param {String} route The route of the item
     * @param {Object} options Additional options for the item
     */
    registerOrganizationMenuItem(title, options = {}) {
        const route = this._getOption(options, 'route', 'console.virtual');
        options.index = this._getOption(options, 'index', 0);
        options.section = this._getOption(options, 'section', 'settings');

        this.organizationMenuItems.pushObject(this._createMenuItem(title, route, options));
    }

    /**
     * Registers a new organization menu item.
     *
     * @method registerOrganizationMenuItem
     * @public
     * @memberof UniverseService
     * @param {String} title The title of the item
     * @param {String} route The route of the item
     * @param {Object} options Additional options for the item
     */
    registerUserMenuItem(title, options = {}) {
        const route = this._getOption(options, 'route', 'console.virtual');
        options.index = this._getOption(options, 'index', 0);
        options.section = this._getOption(options, 'section', 'account');

        this.userMenuItems.pushObject(this._createMenuItem(title, route, options));
    }

    /**
     * Returns the value of a given key on a target object, with a default value.
     *
     * @method _getOption
     * @private
     * @memberof UniverseService
     * @param {Object} target The target object
     * @param {String} key The key to get value for
     * @param {*} defaultValue The default value if the key does not exist
     * @returns {*} The value of the key or default value
     */
    _getOption(target, key, defaultValue = null) {
        return target[key] !== undefined ? target[key] : defaultValue;
    }

    /**
     * Creates a new menu item with the provided information.
     *
     * @method _createMenuItem
     * @private
     * @memberof UniverseService
     * @param {String} title The title of the item
     * @param {String} route The route of the item
     * @param {Object} options Additional options for the item
     * @returns {Object} A new menu item object
     */
    _createMenuItem(title, route, options = {}) {
        const priority = this._getOption(options, 'priority', 9);
        const icon = this._getOption(options, 'icon', 'circle-dot');
        const items = this._getOption(options, 'items');
        const component = this._getOption(options, 'component');
        const componentParams = this._getOption(options, 'componentParams', {});
        const renderComponentInPlace = this._getOption(options, 'renderComponentInPlace', false);
        const slug = this._getOption(options, 'slug', dasherize(title));
        const view = this._getOption(options, 'view');
        const queryParams = this._getOption(options, 'queryParams', {});
        const index = this._getOption(options, 'index', 0);
        const onClick = this._getOption(options, 'onClick', null);
        const section = this._getOption(options, 'section', null);
        const iconComponent = this._getOption(options, 'iconComponent', null);
        const iconComponentOptions = this._getOption(options, 'iconComponentOptions', {});
        const iconSize = this._getOption(options, 'iconSize', null);
        const iconPrefix = this._getOption(options, 'iconPrefix', null);
        const iconClass = this._getOption(options, 'iconClass', null);
        const itemClass = this._getOption(options, 'class', null);
        const inlineClass = this._getOption(options, 'inlineClass', null);
        const wrapperClass = this._getOption(options, 'wrapperClass', null);
        const overwriteWrapperClass = this._getOption(options, 'overwriteWrapperClass', false);

        // dasherize route segments
        if (typeof route === 'string') {
            route = route
                .split('.')
                .map((segment) => dasherize(segment))
                .join('.');
        }

        // todo: create menu item class
        const menuItem = {
            title,
            route,
            icon,
            priority,
            items,
            component,
            componentParams,
            renderComponentInPlace,
            slug,
            queryParams,
            view,
            index,
            section,
            onClick,
            iconComponent,
            iconComponentOptions,
            iconSize,
            iconPrefix,
            iconClass,
            class: itemClass,
            inlineClass,
            wrapperClass,
            overwriteWrapperClass,
        };

        return menuItem;
    }

    /**
     * Creates an internal registry name by camelizing the provided registry name and appending "Registry" to it.
     *
     * @method createInternalRegistryName
     * @public
     * @memberof UniverseService
     * @param {String} registryName - The name of the registry to be camelized and formatted.
     * @returns {String} The formatted internal registry name.
     */
    createInternalRegistryName(registryName) {
        return `${camelize(registryName.replace(/[^a-zA-Z0-9]/g, '-'))}Registry`;
    }

    /**
     * Registers a component class under one or more names within a specified engine instance.
     * This function provides flexibility in component registration by supporting registration under the component's
     * full class name, a simplified alias derived from the class name, and an optional custom name provided through the options.
     * This flexibility facilitates varied referencing styles within different parts of the application, enhancing modularity and reuse.
     *
     * @param {string} engineName - The name of the engine where the component will be registered.
     * @param {class} componentClass - The component class to be registered. Must be a class, not an instance.
     * @param {Object} [options] - Optional parameters for additional configuration.
     * @param {string} [options.registerAs] - A custom name under which the component can also be registered.
     *
     * @example
     * // Register a component with its default and alias names
     * registerComponentInEngine('mainEngine', HeaderComponent);
     *
     * // Additionally register the component under a custom name
     * registerComponentInEngine('mainEngine', HeaderComponent, { registerAs: 'header' });
     *
     * @remarks
     * - The function does not return any value.
     * - Registration only occurs if:
     *   - The specified engine instance exists.
     *   - The component class is properly defined with a non-empty name.
     *   - The custom name, if provided, must be a valid string.
     *   - Allows flexible component referencing by registering under multiple names.
     */
    registerComponentInEngine(engineName, componentClass, options = {}) {
        const engineInstance = this.getEngineInstance(engineName);
        this.registerComponentToEngineInstance(engineInstance, componentClass, options);
    }

    /**
     * Registers a component class under its full class name, a simplified alias, and an optional custom name within a specific engine instance.
     * This helper function does the actual registration of the component to the engine instance. It registers the component under its
     * full class name, a dasherized alias of the class name (with 'Component' suffix removed if present), and any custom name provided via options.
     *
     * @param {EngineInstance} engineInstance - The engine instance where the component will be registered.
     * @param {class} componentClass - The component class to be registered. This should be a class reference, not an instance.
     * @param {Object} [options] - Optional parameters for further configuration.
     * @param {string} [options.registerAs] - A custom name under which the component can be registered.
     *
     * @example
     * // Typical usage within the system (not usually called directly by users)
     * registerComponentToEngineInstance(engineInstance, HeaderComponent, { registerAs: 'header' });
     *
     * @remarks
     * - No return value.
     * - The registration is performed only if:
     *   - The engine instance is valid and not null.
     *   - The component class has a defined and non-empty name.
     *   - The custom name, if provided, is a valid string.
     * - This function directly manipulates the engine instance's registration map.
     */
    registerComponentToEngineInstance(engineInstance, componentClass, options = {}) {
        if (engineInstance && componentClass && typeof componentClass.name === 'string') {
            engineInstance.register(`component:${componentClass.name}`, componentClass);
            engineInstance.register(`component:${dasherize(componentClass.name.replace('Component', ''))}`, componentClass);
            if (options && typeof options.registerAs === 'string') {
                engineInstance.register(`component:${options.registerAs}`, componentClass);
            }
        }
    }

    /**
     * Registers a service from one engine instance to another within the application.
     * This method retrieves an instance of a service from the current engine and then registers it
     * in a target engine, allowing the service to be shared across different parts of the application.
     *
     * @param {string} targetEngineName - The name of the engine where the service should be registered.
     * @param {string} serviceName - The name of the service to be shared and registered.
     * @param {Object} currentEngineInstance - The engine instance that currently holds the service to be shared.
     *
     * @example
     * // Assuming 'appEngine' and 'componentEngine' are existing engine instances and 'logger' is a service in 'appEngine'
     * registerServiceInEngine('componentEngine', 'logger', appEngine);
     *
     * Note:
     * - This function does not return any value.
     * - It only performs registration if all provided parameters are valid:
     *   - Both engine instances must exist.
     *   - The service name must be a string.
     *   - The service must exist in the current engine instance.
     *   - The service is registered without instantiating a new copy in the target engine.
     */
    registerServiceInEngine(targetEngineName, serviceName, currentEngineInstance) {
        // Get the target engine instance
        const targetEngineInstance = this.getEngineInstance(targetEngineName);

        // Validate inputs
        if (targetEngineInstance && currentEngineInstance && typeof serviceName === 'string') {
            // Lookup the service instance from the current engine
            const sharedService = currentEngineInstance.lookup(`service:${serviceName}`);

            if (sharedService) {
                // Register the service in the target engine
                targetEngineInstance.register(`service:${serviceName}`, sharedService, { instantiate: false });
            }
        }
    }

    /**
     * Retrieves a service instance from a specified Ember engine.
     *
     * @param {string} engineName - The name of the engine from which to retrieve the service.
     * @param {string} serviceName - The name of the service to retrieve.
     * @returns {Object|null} The service instance if found, otherwise null.
     *
     * @example
     * const userService = universe.getServiceFromEngine('user-engine', 'user');
     * if (userService) {
     *   userService.doSomething();
     * }
     */
    getServiceFromEngine(engineName, serviceName, options = {}) {
        const engineInstance = this.getEngineInstance(engineName);

        if (engineInstance && typeof serviceName === 'string') {
            const serviceInstance = engineInstance.lookup(`service:${serviceName}`);
            if (options && options.inject) {
                for (let injectionName in options.inject) {
                    serviceInstance[injectionName] = options.inject[injectionName];
                }
            }
            return serviceInstance;
        }

        return null;
    }

    /**
     * Load the specified engine. If it is not loaded yet, it will use assetLoader
     * to load it and then register it to the router.
     *
     * @method loadEngine
     * @public
     * @memberof UniverseService
     * @param {String} name The name of the engine to load
     * @returns {Promise} A promise that resolves with the constructed engine instance
     */
    loadEngine(name) {
        const router = getOwner(this).lookup('router:main');
        const instanceId = 'manual'; // Arbitrary instance id, should be unique per engine
        const mountPoint = this._mountPathFromEngineName(name); // No mount point for manually loaded engines

        if (!router._enginePromises[name]) {
            router._enginePromises[name] = Object.create(null);
        }

        let enginePromise = router._enginePromises[name][instanceId];

        // We already have a Promise for this engine instance
        if (enginePromise) {
            return enginePromise;
        }

        if (router._engineIsLoaded(name)) {
            // The Engine is loaded, but has no Promise
            enginePromise = RSVP.resolve();
        } else {
            // The Engine is not loaded and has no Promise
            enginePromise = router._assetLoader.loadBundle(name).then(
                () => router._registerEngine(name),
                (error) => {
                    router._enginePromises[name][instanceId] = undefined;
                    throw error;
                }
            );
        }

        return (router._enginePromises[name][instanceId] = enginePromise.then(() => {
            return this.constructEngineInstance(name, instanceId, mountPoint);
        }));
    }

    /**
     * Construct an engine instance. If the instance does not exist yet, it will be created.
     *
     * @method constructEngineInstance
     * @public
     * @memberof UniverseService
     * @param {String} name The name of the engine
     * @param {String} instanceId The id of the engine instance
     * @param {String} mountPoint The mount point of the engine
     * @returns {Promise} A promise that resolves with the constructed engine instance
     */
    constructEngineInstance(name, instanceId, mountPoint) {
        const owner = getOwner(this);

        assert("You attempted to load the engine '" + name + "', but the engine cannot be found.", owner.hasRegistration(`engine:${name}`));

        let engineInstances = owner.lookup('router:main')._engineInstances;
        if (!engineInstances[name]) {
            engineInstances[name] = Object.create(null);
        }

        let engineInstance = owner.buildChildEngineInstance(name, {
            routable: true,
            mountPoint,
        });

        // correct mountPoint using engine instance
        let _mountPoint = this._getMountPointFromEngineInstance(engineInstance);
        if (_mountPoint) {
            engineInstance.mountPoint = _mountPoint;
        }

        // make sure to set dependencies from base instance
        if (engineInstance.base) {
            engineInstance.dependencies = this._setupEngineParentDependenciesBeforeBoot(engineInstance.base.dependencies);
        }

        // store loaded instance to engineInstances for booting
        engineInstances[name][instanceId] = engineInstance;

        return engineInstance.boot().then(() => {
            return engineInstance;
        });
    }

    _setupEngineParentDependenciesBeforeBoot(baseDependencies = {}) {
        const dependencies = { ...baseDependencies };

        // fix services
        const servicesObject = {};
        if (isArray(dependencies.services)) {
            for (let i = 0; i < dependencies.services.length; i++) {
                const service = dependencies.services.objectAt(i);

                if (typeof service === 'object') {
                    Object.assign(servicesObject, service);
                    continue;
                }

                servicesObject[service] = service;
            }
        }

        // fix external routes
        const externalRoutesObject = {};
        if (isArray(dependencies.externalRoutes)) {
            for (let i = 0; i < dependencies.externalRoutes.length; i++) {
                const externalRoute = dependencies.externalRoutes.objectAt(i);

                if (typeof externalRoute === 'object') {
                    Object.assign(externalRoutesObject, externalRoute);
                    continue;
                }

                externalRoutesObject[externalRoute] = externalRoute;
            }
        }

        dependencies.externalRoutes = externalRoutesObject;
        dependencies.services = servicesObject;
        return dependencies;
    }

    /**
     * Retrieve an existing engine instance by its name and instanceId.
     *
     * @method getEngineInstance
     * @public
     * @memberof UniverseService
     * @param {String} name The name of the engine
     * @param {String} [instanceId='manual'] The id of the engine instance (defaults to 'manual')
     * @returns {Object|null} The engine instance if it exists, otherwise null
     */
    getEngineInstance(name, instanceId = 'manual') {
        const owner = getOwner(this);
        const router = owner.lookup('router:main');
        const engineInstances = router._engineInstances;

        if (engineInstances && engineInstances[name]) {
            return engineInstances[name][instanceId] || null;
        }

        return null;
    }

    /**
     * Boot all installed engines, ensuring dependencies are resolved.
     *
     * This method attempts to boot all installed engines by first checking if all
     * their dependencies are already booted. If an engine has dependencies that
     * are not yet booted, it is deferred and retried after its dependencies are
     * booted. If some dependencies are never booted, an error is logged.
     *
     * @method bootEngines
     * @param {ApplicationInstance|null} owner - The Ember ApplicationInstance that owns the engines.
     * @return {void}
     */
    bootEngines(owner = null) {
        const booted = [];
        const pending = [];
        const additionalCoreExtensions = config.APP.extensions ?? [];

        // If no owner provided use the owner of this service
        if (owner === null) {
            owner = getOwner(this);
        }

        const tryBootEngine = (extension) => {
            this.loadEngine(extension.name).then((engineInstance) => {
                if (engineInstance.base && engineInstance.base.setupExtension) {
                    if (booted.includes(extension.name)) {
                        return;
                    }

                    const engineDependencies = getWithDefault(engineInstance.base, 'engineDependencies', []);
                    const allDependenciesBooted = engineDependencies.every((dep) => booted.includes(dep));

                    if (!allDependenciesBooted) {
                        pending.push({ extension, engineInstance });
                        return;
                    }

                    engineInstance.base.setupExtension(owner, engineInstance, this);
                    booted.push(extension.name);
                    debug(`Booted : ${extension.name}`);

                    // Try booting pending engines again
                    tryBootPendingEngines();
                }
            });
        };

        const tryBootPendingEngines = () => {
            const stillPending = [];

            pending.forEach(({ extension, engineInstance }) => {
                if (booted.includes(extension.name)) {
                    return;
                }

                const engineDependencies = getWithDefault(engineInstance.base, 'engineDependencies', []);
                const allDependenciesBooted = engineDependencies.every((dep) => booted.includes(dep));

                if (allDependenciesBooted) {
                    engineInstance.base.setupExtension(owner, engineInstance, this);
                    booted.push(extension.name);
                    debug(`Booted : ${extension.name}`);
                } else {
                    stillPending.push({ extension, engineInstance });
                }
            });

            // If no progress was made, log an error in debug/development mode
            assert(`Some engines have unmet dependencies and cannot be booted:`, stillPending.length === 0 && pending.length === 0);

            pending.length = 0;
            pending.push(...stillPending);
        };

        loadInstalledExtensions(additionalCoreExtensions).then((extensions) => {
            extensions.forEach((extension) => {
                tryBootEngine(extension);
            });
        });
    }

    /**
     * Boots all installed engines, ensuring dependencies are resolved.
     *
     * This method loads all installed extensions and then attempts to boot each engine.
     * For each extension, it loads the engine and, if the engine has a `setupExtension`
     * method in its base, it calls this method to complete the setup. This function ensures
     * that dependencies are resolved before booting the engines. If some dependencies are
     * never booted, an error is logged.
     *
     * @method legacyBootEngines
     * @param {ApplicationInstance|null} owner - The Ember ApplicationInstance that owns the engines.
     * @return {void}
     */
    legacyBootEngines(owner = null) {
        const booted = [];
        const pending = [];

        // If no owner provided use the owner of this service
        if (owner === null) {
            owner = getOwner(this);
        }

        const tryBootEngine = (extension) => {
            this.loadEngine(extension.name).then((engineInstance) => {
                if (engineInstance.base && engineInstance.base.setupExtension) {
                    const engineDependencies = getWithDefault(engineInstance.base, 'engineDependencies', []);

                    // Check if all dependency engines are booted
                    const allDependenciesBooted = engineDependencies.every((dep) => booted.includes(dep));

                    if (!allDependenciesBooted) {
                        pending.push({ extension, engineInstance });
                        return;
                    }

                    engineInstance.base.setupExtension(owner, engineInstance, this);
                    booted.push(extension.name);
                    debug(`Booted : ${extension.name}`);

                    // Try booting pending engines again
                    tryBootPendingEngines();
                }
            });
        };

        const tryBootPendingEngines = () => {
            const stillPending = [];

            pending.forEach(({ extension, engineInstance }) => {
                const engineDependencies = getWithDefault(engineInstance.base, 'engineDependencies', []);
                const allDependenciesBooted = engineDependencies.every((dep) => booted.includes(dep));

                if (allDependenciesBooted) {
                    engineInstance.base.setupExtension(owner, engineInstance, this);
                    booted.push(extension.name);
                    debug(`Booted : ${extension.name}`);
                } else {
                    stillPending.push({ extension, engineInstance });
                }
            });

            // If no progress was made, log an error in debug/development mode
            assert('Some engines have unmet dependencies and cannot be booted:', pending.length === stillPending.length);

            pending.length = 0;
            pending.push(...stillPending);
        };

        loadExtensions().then((extensions) => {
            extensions.forEach((extension) => {
                tryBootEngine(extension);
            });
        });
    }

    /**
     * Alias for intl service `t`
     *
     * @memberof UniverseService
     */
    t() {
        this.intl.t(...arguments);
    }
}
